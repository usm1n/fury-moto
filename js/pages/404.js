import { config } from "../core/config.js";
import { text } from "../core/render.js";

export default function mount(main) {
  const nf = config.notFound || {};
  document.title = (config.seo?.titleTemplate || "%s").replace("%s", nf.title || "404");
  text(main.querySelector('[data-nf="title"]'), nf.title);
  text(main.querySelector('[data-nf="text"]'), nf.text);
  text(main.querySelector('[data-nf="button"]'), nf.button);
}
