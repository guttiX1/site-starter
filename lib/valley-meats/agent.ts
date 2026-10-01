// OpenAI tool-calling loop for the Valley Meats voice agent. One call to
// runAgent() handles one customer utterance and returns the spoken reply plus
// the updated order state. No SDK: plain fetch against the Chat Completions API.

import { MENU, RESTAURANT, formatMoney, hoursText, openStatus } from "./menu";
import {
  OrderState,
  PlacedOrder,
  addItem,
  findItems,
  placeOrder,
  removeItem,
  reviewOrder,
  setDetails,
  summary,
} from "./order";

export type ChatMessage = { role: "user" | "assistant"; content: string };

const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const MAX_TOOL_ROUNDS = 6;

function systemPrompt(): string {
  const status = openStatus();
  const menu = MENU.map(
    (m) =>
      `- ${m.name} [${m.category}] ${formatMoney(m.priceCents)}: ${m.description}` +
      (m.options ? ` Options: ${m.options.join("/")}.` : "") +
      (m.tags?.length ? ` (${m.tags.join(", ")})` : ""),
  ).join("\n");
  return `You are the voice assistant for ${RESTAURANT.name}, a meat-focused restaurant. You talk with customers by voice, so:
- Keep replies to 1–2 short sentences. No lists, markdown, emoji or symbols; say prices like "twenty-eight ninety-nine".
- Ask only one question at a time.
- Customers can use you for three things: ordering, questions (menu, hours, location, allergens), and checkout.

Right now the restaurant is: ${status.text}
Address: ${RESTAURANT.address}. Phone: ${RESTAURANT.phone}.
Hours:
${hoursText()}
Delivery: within ${RESTAURANT.deliveryRadiusMiles} miles, $${(RESTAURANT.deliveryFeeCents / 100).toFixed(2)} fee, $${(RESTAURANT.deliveryMinimumCents / 100).toFixed(2)} minimum. Pickup ready in about ${RESTAURANT.prepMinutes.pickup} minutes, delivery about ${RESTAURANT.prepMinutes.delivery}.
Notes: ${RESTAURANT.notes.join(" ")}

MENU (the only items that exist):
${menu}

RULES
- Only state menu, price, hours and policy facts from above. If you don't know, say so and offer the restaurant phone number. Never invent items, discounts or ingredients.
- Allergy questions: share only the tags listed, and say the kitchen can't guarantee allergen-free preparation.
- To change the order you MUST call the tools; never claim an item was added unless the tool succeeded. Steaks and some items require an option such as doneness — ask for it before adding.
- Checkout: collect fulfillment (pickup or delivery), delivery address if needed, the customer's name and phone number via set_order_details. Then call review_order, read back every item, the total and the name and phone number, and ask "Shall I place it?". Call place_order ONLY after the customer clearly says yes to that read-back. If anything changes afterwards, review again.
- Payment is at pickup, or to the driver on delivery. Never ask for or accept card numbers by voice; if offered, tell them not to share it.
- Speech recognition can mishear. If an item, name or number seems odd, confirm it. Spell back phone numbers digit by digit.
- Stay on topic; politely decline anything unrelated to ${RESTAURANT.name}.`;
}

const TOOLS = [
  {
    type: "function",
    function: {
      name: "search_menu",
      description: "Look up menu items by name/keyword, or list a whole category.",
      parameters: {
        type: "object",
        properties: { query: { type: "string", description: "Item name or keyword; or a category name" } },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_item",
      description: "Add an item to the order.",
      parameters: {
        type: "object",
        properties: {
          item: { type: "string", description: "Menu item name as the customer said it" },
          quantity: { type: "integer", minimum: 1 },
          option: { type: "string", description: "Required option such as doneness, if the item has options" },
          notes: { type: "string", description: "Special request, e.g. 'no pickles'" },
        },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "remove_item",
      description: "Remove an item (or reduce its quantity) from the order.",
      parameters: {
        type: "object",
        properties: { item: { type: "string" }, quantity: { type: "integer", minimum: 1 } },
        required: ["item"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order",
      description: "Get the current order contents and totals.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "set_order_details",
      description: "Record fulfillment method and the customer's contact details. Only pass fields the customer actually provided.",
      parameters: {
        type: "object",
        properties: {
          fulfillment: { type: "string", enum: ["pickup", "delivery"] },
          delivery_address: { type: "string" },
          customer_name: { type: "string" },
          customer_phone: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "review_order",
      description: "Validate the order is complete and get the final read-back. Call before place_order.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "place_order",
      description: "Submit the order to the kitchen. Only after the customer said yes to the read-back from review_order.",
      parameters: { type: "object", properties: {} },
    },
  },
];

type ToolCall = { id: string; function: { name: string; arguments: string } };
type OAIMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

async function chat(messages: OAIMessage[]) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: MODEL, messages, tools: TOOLS, temperature: 0.3, max_tokens: 300 }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  return json.choices[0].message as { content: string | null; tool_calls?: ToolCall[] };
}

export async function runAgent(
  history: ChatMessage[],
  initial: OrderState,
  submitOrder: (o: PlacedOrder) => Promise<void>,
): Promise<{ reply: string; state: OrderState }> {
  let state = initial;
  const messages: OAIMessage[] = [{ role: "system", content: systemPrompt() }, ...history];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await chat(messages);
    if (!msg.tool_calls?.length) {
      return { reply: (msg.content ?? "").trim() || "Sorry, could you say that again?", state };
    }
    messages.push({ role: "assistant", content: msg.content, tool_calls: msg.tool_calls });

    for (const call of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        /* leave empty; the tool will report what's missing */
      }
      let result: unknown;
      switch (call.function.name) {
        case "search_menu": {
          const q = String(args.query ?? "");
          const byCat = MENU.filter((m) => m.category.toLowerCase().includes(q.toLowerCase().trim()) && q.trim());
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
          const r = setDetails(state, args as never);
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
          let pending: PlacedOrder | undefined;
          const r = placeOrder(state, (o) => (pending = o));
          state = r.state;
          result = r.result;
          if (pending) {
            try {
              await submitOrder(pending);
            } catch (e) {
              console.error("[valley-meats] order submit failed", e);
              state = before; // not sent to the kitchen, so don't tell the customer it was
              result = { error: `Couldn't send the order to the kitchen. Apologize and ask them to call ${RESTAURANT.phone}.` };
            }
          }
          break;
        }
        default:
          result = { error: `Unknown tool ${call.function.name}` };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return { reply: `Sorry, I got tangled up there. Could you repeat that, or call us at ${RESTAURANT.phone}?`, state };
}
