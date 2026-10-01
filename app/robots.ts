import { robots } from "@/lib/site-kit";
import { site } from "@/site.config";

export default function Robots() {
  return robots(site);
}
