const reservationForm = document.querySelector("#reservationForm");
const reservationMessage = document.querySelector("#reservationMessage");
const validateReservationTime = setupBookingTime(reservationForm, "reservation");
reservationForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!validateReservationTime() || !reservationForm.reportValidity()) { reservationForm.reportValidity(); return; }
  const data = new FormData(reservationForm);
  const payload = Object.fromEntries(["name", "phone", "email", "date", "time", "guests", "notes"].map(key => [key, String(data.get(key) || "").trim()]));
  const button = reservationForm.querySelector('[type="submit"]');
  button.disabled = true;
  reservationMessage.textContent = "Sending your reservation request...";
  reservationMessage.dataset.type = "";
  try {
    const response = await fetch("/api/reservations", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": Pantry.submissionKey("reservation", payload) }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.reference) throw new Error(result.message || "Your reservation could not be confirmed. Please try again or call 03 6288 7654.");
    try {
      sessionStorage.setItem("argylePantrySubmission", JSON.stringify({ type: "reservation", reference: result.reference, reservation: payload, receiptSent: result.receiptSent === true, submittedAt: new Date().toISOString() }));
      sessionStorage.removeItem("argylePantryPending:reservation");
    } catch {
      reservationMessage.textContent = `Reservation request received. Reference ${result.reference}. Please call 03 6288 7654 to confirm your table.`;
      button.hidden = true;
      return;
    }
    location.assign("success.html?type=reservation");
  } catch (error) {
    reservationMessage.dataset.type = "error";
    reservationMessage.textContent = error instanceof TypeError ? "Connection interrupted. Please retry with the same details so we can check your request without duplicating it." : error.message;
  } finally { button.disabled = false; }
});
