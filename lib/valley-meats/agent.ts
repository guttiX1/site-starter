// Claude tool-calling loop for the Valley Meats voice agent. One call to
// runAgent() handles one customer utterance and returns the spoken reply plus
// the updated order state.

import Anthropic from "@anthropic-ai/sdk";
import { MENU, RESTAURANT, formatMoney, hoursText, openStatus } from "./menu";
import {
  OrderState,
  PlacedOrder,
  addItem,
  finalizeOrder,
  findItems,
  removeItem,
  reviewOrder,
  setDetails,
  summary,
} from "./order";
import { createCheckoutUrl, onlinePaymentEnabled } from "./stripe";

export type ChatMessage = { role: "user" | "assistant"; content: string };

// claude-sonnet-5-5 is a faster/cheaper choice if voice latency matters more than depth.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";
const MAX_TOOL_ROUNDS = 6;

let client: Anthropic | undefined;
const getClient = () => (client ??= new Anthropic({ timeout: 30_000, maxRetries: 1 }));

function systemPrompt(): string {
  const status = openStatus();
  const menu = MENU.map(
    (m) =>
      `- ${m.name} [${m.category}] ${formatMoney(m.priceCents)}: ${m.description}` +
      (m.options ? ` Options (required): ${m.options.join("/")}.` : "") +
      (m.tags?.length ? ` (${m.tags.join(", ")})` : ""),
  ).join("\n");
  return `You are the voice assistant for ${RESTAURANT.name}, a Mexican restaurant. Latency-sensitive: begin your visible answer immediately. You talk with customers by voice, so:
- Keep replies to 1–2 short sentences. No lists, markdown, emoji or symbols; say prices naturally, like "eleven ninety-nine".
- Ask only one question at a time.
- Customers can use you for three things: ordering, questions (menu, hours, location, delivery, allergens), and checkout.

Right now the restaurant is: ${status.text}
Address: ${RESTAURANT.address}. Phone: ${RESTAURANT.phone}.
Hours:
${hoursText()}
Delivery: within ${RESTAURANT.deliveryRadiusMiles} miles, $${(RESTAURANT.deliveryFeeCents / 100).toFixed(2)} fee, $${(RESTAURANT.deliveryMinimumCents / 100).toFixed(2)} minimum before tax. Pickup ready in about ${RESTAURANT.prepMinutes.pickup} minutes, delivery about ${RESTAURANT.prepMinutes.delivery}.
Notes: ${RESTAURANT.notes.join(" ")}
Payment options: in person${onlinePaymentEnabled() ? ", or online through a secure payment link shown on the customer's screen" : " only (online payment is not available)"}.

MENU (the only items that exist):
${menu}

RULES
- Only state menu, price, hours and policy facts from above. If you don't know, say so and offer the restaurant phone number. Never invent items, discounts or ingredients.
- Allergy questions: share only the tags listed, and say the kitchen can't guarantee allergen-free preparation.
- To change the order you MUST call the tools; never claim an item was added unless the tool succeeded. Items with required options need one chosen (e.g. the protein for tacos or burritos) — ask before adding. Tacos are priced per taco.
- Checkout: collect pickup or delivery, the delivery address if needed, the customer's name and phone number, and how they'll pay, saving each with set_order_details. Then call review_order, read back every item, the total, the name and phone number, and ask "Shall I place it?". Call place_order ONLY after the customer clearly says yes to that read-back. If anything changes afterwards, review again.
- NEVER ask for or accept card numbers, expiry dates or CVV by voice, even if offered — tell the customer to use the payment link on their screen or to pay in person. For online payment, after place_order succeeds tell them the payment link is on their screen.
- Speech recognition can mishear. If an item, name or number seems odd, confirm it. Repeat phone numbers back digit by digit.
- Stay on topic; politely decline anything unrelated to ${RESTAURANT.name}.`;
}

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_menu",
    description: "Look up menu items by name/keyword, or list a whole category.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Item name or keyword; or a category name" } },
      required: ["query"],
    },
  },
  {
    name: "add_item",
    description: "Add an item to the order.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "Menu item name as the customer said it" },
        quantity: { type: "integer", minimum: 1 },
        option: { type: "string", description: "Required option such as protein, if the item has options" },
        notes: { type: "string", description: "Special request, e.g. 'no onions'" },
      },
      required: ["item"],
    },
  },
  {
    name: "remove_item",
    description: "Remove an item (or reduce its quantity) from the order.",
    input_schema: {
      type: "object",
      properties: { item: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
      required: ["item"],
    },
  },
  {
    name: "get_order",
    description: "Get the current order contents and totals.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "set_order_details",
    description:
      "Record fulfillment, contact details and payment method. Only pass fields the customer actually provided.",
    input_schema: {
      type: "object",
      properties: {
        fulfillment: { type: "string", enum: ["pickup", "delivery"] },
        delivery_address: { type: "string" },
        customer_name: { type: "string" },
        customer_phone: { type: "string" },
        payment: { type: "string", enum: ["in_person", "online"] },
      },
    },
  },
  {
    name: "review_order",
    description: "Validate the order is complete and get the final read-back. Call before place_order.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "place_order",
    description: "Submit the order to the kitchen. Only after the customer said yes to the read-back from review_order.",
    input_schema: { type: "object", properties: {} },
  },
];

export type AgentContext = {
  /** Public origin used for payment redirect URLs. */
  origin: string;
  /** Deliver a placed order to the kitchen/POS; throw if it didn't go through. */
  submitOrder: (o: PlacedOrder) => Promise<void>;
};

export async function runAgent(
  history: ChatMessage[],
  initial: OrderState,
  ctx: AgentContext,
): Promise<{ reply: string; state: OrderState }> {
  let state = initial;
  const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const sorry = `Sorry, I got tangled up there. Could you repeat that, or call us at ${RESTAURANT.phone}?`;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4096, // thinking tokens count against this
      system: systemPrompt(),
      tools: TOOLS,
      messages,
      thinking: { type: "adaptive" },
      output_config: { effort: "low" }, // fast turns for voice
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    if (response.stop_reason === "refusal") {
      return { reply: `Sorry, I can't help with that one. Is there anything I can get you from the menu?`, state };
    }
    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join(" ")
      .trim();
    const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      if (response.stop_reason === "max_tokens") return { reply: text || sorry, state };
      return { reply: text || "Sorry, could you say that again?", state };
    }

    // Echo the full assistant turn (thinking blocks included) back with the results.
    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];

    for (const call of toolUses) {
      const args = (call.input && typeof call.input === "object" ? call.input : {}) as Record<string, unknown>;
      let result: unknown;
      switch (call.name) {
        case "search_menu": {
          const q = String(args.query ?? "");
          const byCat = q.trim() ? MENU.filter((m) => m.category.toLowerCase().includes(q.toLowerCase().trim())) : [];
          const items = byCat.length ? byCat : findItems(q);
          result = items.length
            ? items.map((m) => ({ name: m.name, price: m.priceCents / 100, options: m.options, tags: m.tags }))
            : { error: "No matches." };
          break;
        }
        case "add_item": {
          const r = addItem(state, args as never);
          state = r.state;
          result = r.result;
          break;
        }
        case "remove_item": {
          const r = removeItem(state, args as never);
          state = r.state;
          result = r.result;
          break;
        }
        case "get_order":
          result = summary(state);
          break;
        case "set_order_details": {
          const r = setDetails(state, args as never, { onlinePayment: onlinePaymentEnabled() });
          state = r.state;
          result = r.result;
          break;
        }
        case "review_order": {
          const r = reviewOrder(state);
          state = r.state;
          result = r.result;
          break;
        }
        case "place_order": {
          const before = state;
          const r = finalizeOrder(state);
          state = r.state;
          result = r.result;
          if (r.order) {
            try {
              if (state.payment === "online") {
                const url = await createCheckoutUrl(r.order.orderId, state, ctx.origin);
                r.order.paymentUrl = url;
                state = { ...state, placed: { ...state.placed!, paymentUrl: url } };
              }
              await ctx.submitOrder(r.order);
            } catch (e) {
              console.error("[valley-meats] place order failed", e);
              state = before; // not sent, so don't tell the customer it was
              result = { error: `Couldn't complete the order. Apologize and ask them to call ${RESTAURANT.phone}.` };
            }
          }
          break;
        }
        default:
          result = { error: `Unknown tool ${call.name}` };
      }
      results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: sorry, state };
}
