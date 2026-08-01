/**
 * Client-side legal microcopy tests — F-legal (kanban t_2bef9ebb).
 *
 * Covers, in jsdom with @testing-library/react:
 *   1. ReportForm WITHOUT photos renders no redaction checkbox (G3: the
 *      confirmation must never block a report that has no photos);
 *   2. ReportForm WITH photos renders the conditional redaction checkbox,
 *      required and unchecked by default (GDPR art. 5(2) accountability,
 *      "confermo/dichiaro" register — never a consent checkbox);
 *   3. the art. 13 mini-notice is rendered next to the report checkbox
 *      (controller, legal basis 6(1)(f), /privacy link, privacy contact
 *      mailto), and the same microcopy exists next to the correction
 *      checkbox (6(1)(c)+6(1)(f) variant) and on the register page
 *      (6(1)(f) variant);
 *   4. the locale toggle flips the redaction label EN <-> IT (i18n parity).
 *
 * Fixtures are fictitious (example.test addresses, made-up photo items) —
 * never real personal data.
 */
import assert from "node:assert/strict";
import test, { afterEach, before } from "node:test";
import {
  setupDom, loadDomModule, loadDomPage, renderWithLocale, React,
} from "./helpers/dom-harness.mjs";

let rtl;
let ReportForm;
let CorrectionForm;
let RegisterPage;
let LocaleToggle;

before(async () => {
  rtl = await setupDom();
  ReportForm = (await loadDomModule("app/components/home/ReportForm.mjs")).ReportForm;
  CorrectionForm = (await loadDomModule("app/components/home/CorrectionForm.mjs")).CorrectionForm;
  RegisterPage = await loadDomPage("app/register/page.mjs");
  LocaleToggle = (await loadDomModule("app/components/LocaleProvider.mjs")).LocaleToggle;
});

afterEach(() => rtl?.cleanup());

// Fictitious photo item (shape of the upload response, no real data).
const fakePhoto = { id: 1, mimeType: "image/jpeg", width: 640, height: 480, name: "fixture.jpg" };

function reportFormProps(photos = []) {
  return {
    coordinates: null,
    manualLatitude: "",
    setManualLatitude: () => {},
    manualLongitude: "",
    setManualLongitude: () => {},
    nearbyCandidates: [],
    nearbyLoading: false,
    nearbyError: "",
    photos,
    photoUploading: false,
    photoInputRef: React.createRef(),
    onPhotoSelected: () => {},
    removePhoto: () => {},
    selectManualCoordinates: () => {},
    submitReport: () => {},
  };
}

test("report form without photos renders no redaction confirmation checkbox", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps([])));
  const { container } = view;

  const checkboxes = [...container.querySelectorAll(".report-form input[type='checkbox']")];
  // Only the public-report attestation checkbox — no redaction confirmation.
  assert.equal(checkboxes.length, 1, "only the report consent checkbox must render without photos");
  const redaction = container.querySelector(".photo-upload input[type='checkbox']");
  assert.equal(redaction, null, "redaction confirmation must not render when photos.length === 0");
});

test("report form with photos renders the required redaction confirmation checkbox", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps([fakePhoto])));
  const { container } = view;

  const checkboxes = [...container.querySelectorAll(".report-form input[type='checkbox']")];
  assert.equal(checkboxes.length, 2, "report consent + redaction confirmation must render with photos");

  const redaction = container.querySelector(".photo-upload input[type='checkbox']");
  assert.ok(redaction, "redaction confirmation must render inside the photo upload fieldset");
  assert.notEqual(redaction.getAttribute("required"), null, "redaction confirmation must be required when photos are present");
  assert.equal(redaction.checked, false, "redaction confirmation must never be pre-checked");
  // a11y: the checkbox points to the art. 13 mini-notice (same as the other
  // form checkboxes).
  assert.equal(redaction.getAttribute("aria-describedby"), "report-art13-note");

  const label = container.querySelector(".check-redaction span");
  assert.ok(label, "redaction label must render");
  assert.match(label.textContent, /I confirm that I have redacted \(blurred or removed\) any faces and licence plates in the photos\./);
});

test("report form carries the art. 13 mini-notice next to the consent checkbox", async () => {
  const view = await renderWithLocale(React.createElement(ReportForm, reportFormProps([])));
  const { container } = view;

  const notice = container.querySelector("#report-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render next to the report checkbox");
  assert.match(notice.textContent, /legitimate interest \(art\. 6\(1\)\(f\) GDPR\)/);
  assert.match(notice.textContent, /privacy@opensurveillancedb.org/);

  const privacyLink = notice.querySelector("a[href='/privacy']");
  assert.ok(privacyLink, "mini-notice must link the full privacy notice");
  const mailto = notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']");
  assert.ok(mailto, "mini-notice must expose the rights contact as a mailto link");
});

test("correction form carries the art. 13 mini-notice (6(1)(c) + 6(1)(f) variant)", async () => {
  const view = await renderWithLocale(React.createElement(CorrectionForm, { records: [] }));
  const { container } = view;

  const notice = container.querySelector("#correction-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render next to the correction checkbox");
  assert.match(notice.textContent, /legal obligation \(art\. 6\(1\)\(c\) GDPR — arts\. 15-22\)/);
  assert.ok(notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']"), "correction mini-notice must carry the mailto contact");

  const consent = container.querySelector(".correction-form input[type='checkbox']");
  assert.equal(consent.getAttribute("aria-describedby"), "correction-art13-note", "correction checkbox must reference the mini-notice");
});

test("register page carries the art. 13 mini-notice (6(1)(f) variant)", async () => {
  const view = await renderWithLocale(React.createElement(RegisterPage));
  const { container } = view;

  const notice = container.querySelector("#register-art13-note");
  assert.ok(notice, "art. 13 mini-notice must render on the register page");
  assert.match(notice.textContent, /to provide contributor accounts/);
  assert.ok(notice.querySelector("a[href='/privacy']"), "register mini-notice must link the privacy notice");
  assert.ok(notice.querySelector("a[href='mailto:privacy@opensurveillancedb.org']"), "register mini-notice must carry the mailto contact");
});

test("locale toggle flips the redaction confirmation label EN <-> IT", async () => {
  const user = rtl.userEvent.setup();
  const view = await renderWithLocale(
    React.createElement("div", null,
      React.createElement(LocaleToggle),
      React.createElement(ReportForm, reportFormProps([fakePhoto])),
    ),
  );
  const { container } = view;

  const enLabel = container.querySelector(".check-redaction span");
  assert.ok(enLabel.textContent.includes("I confirm that I have redacted"), "EN label by default");

  await user.click(view.getByRole("button", { name: "IT" }));

  const itLabel = container.querySelector(".check-redaction span");
  assert.ok(itLabel.textContent.includes("Confermo di aver oscurato volti e targhe nelle foto."), "IT label after toggle");

  // The mini-notice flips too (art. 13 copy is bilingual).
  assert.ok(container.querySelector("#report-art13-note").textContent.includes("interesse legittimo"));

  await user.click(view.getByRole("button", { name: "EN" }));
  assert.ok(container.querySelector(".check-redaction span").textContent.includes("redacted"), "EN label restored");
});
