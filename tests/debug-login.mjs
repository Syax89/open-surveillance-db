// Debug login submit interaction
import { React, installFetchMock, jsonResponse, loadDomPage, setupDom, wrapWithLocale } from "./helpers/dom-harness.mjs";

const rtl = await setupDom();
const user = rtl.userEvent.setup();
let fetchCalled = false;
installFetchMock(() => {
  fetchCalled = true;
  return jsonResponse({ error: "invalid credentials" }, { status: 401 });
});

const LoginPage = await loadDomPage("app/login/page.mjs");
rtl.render(await wrapWithLocale(React.createElement(LoginPage)));
const emailInput = rtl.screen.getByLabelText("Email");
const passwordInput = rtl.screen.getByLabelText(/^Password/);
console.log("initial aria-invalid:", emailInput.getAttribute("aria-invalid"), passwordInput.getAttribute("aria-invalid"));
console.log("button found:", rtl.screen.getByRole("button", { name: /log in/i }).outerHTML.slice(0, 120));
await user.click(rtl.screen.getByRole("button", { name: /log in/i }));
console.log("after click aria-invalid:", emailInput.getAttribute("aria-invalid"), passwordInput.getAttribute("aria-invalid"));
console.log("fetchCalled:", fetchCalled);
console.log("form html:", document.querySelector("form").outerHTML.slice(0, 600));
process.exit(0);
