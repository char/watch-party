import { createCreationForm } from "./ui/create.tsx";

const main = document.querySelector("main")!;
const form = createCreationForm(id => {
  window.location.href = "/#" + encodeURIComponent(id);
});
main.append(form);
