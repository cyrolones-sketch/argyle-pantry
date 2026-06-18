const reservationForm = document.querySelector("#reservationForm");
const reservationMessage = document.querySelector("#reservationMessage");
const TRADING_OPEN = "11:30";
const TRADING_CLOSE = "20:30";
const SERVICE_WAKE_DELAYS = [0, 2000, 4000, 8000];

function setReservationMessage(text, type = "") {
  if (!reservationMessage) return;
  reservationMessage.textContent = text;
  reservationMessage.dataset.type = type;
}

function reservationPayload(form) {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim(),
    date: String(data.get("date") || "").trim(),
    time: String(data.get("time") || "").trim(),
    guests: String(data.get("guests") || "").trim(),
    notes: String(data.get("notes") || "").trim()
  };
}

async function waitForReservationService() {
  for (const delay of SERVICE_WAKE_DELAYS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Render may still be waking from sleep; try again after the next delay.
    }
  }
  throw new TypeError("Reservation service is unavailable.");
}

if (reservationForm) {
  const dateInput = reservationForm.querySelector('input[name="date"]');
  const timeInput = reservationForm.querySelector('input[name="time"]');
  if (dateInput) {
    dateInput.min = localDateValue(new Date());
    dateInput.addEventListener("change", () => validateOpenDate(dateInput));
  }
  if (timeInput) {
    timeInput.min = TRADING_OPEN;
    timeInput.max = TRADING_CLOSE;
  }

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (dateInput && !validateOpenDate(dateInput)) {
      dateInput.reportValidity();
      return;
    }
    if (!reservationForm.checkValidity()) {
      reservationForm.reportValidity();
      return;
    }

    const submitButton = reservationForm.querySelector('button[type="submit"]');
    const originalText = submitButton?.textContent || "Reserve";
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "Sending...";
    }
    setReservationMessage("", "");

    try {
      if (submitButton) submitButton.textContent = "Connecting...";
      await waitForReservationService();
      if (submitButton) submitButton.textContent = "Sending...";
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(reservationPayload(reservationForm))
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Reservation could not be sent. Please try again.");
      }

      reservationForm.reset();
      if (dateInput) dateInput.min = localDateValue(new Date());
      if (timeInput) {
        timeInput.min = TRADING_OPEN;
        timeInput.max = TRADING_CLOSE;
      }
      const successMessage = result.receiptSent === false
        ? "Thank you. Your reservation request has been sent to Argyle Pantry."
        : "Thank you. Your reservation request has been sent. A receipt has also been emailed to you.";
      setReservationMessage(successMessage, "success");
    } catch (error) {
      const message = error instanceof TypeError
        ? "The reservation service is taking longer than expected to start. Please wait a moment and try again."
        : error.message;
      setReservationMessage(message, "error");
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText;
      }
    }
  });
}

waitForReservationService().catch(() => {});

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSaturday(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return Boolean(year && month && day) && new Date(year, month - 1, day).getDay() === 6;
}

function validateOpenDate(input) {
  input.setCustomValidity(isSaturday(input.value) ? "Argyle Pantry is closed on Saturdays. Please choose another day." : "");
  return input.checkValidity();
}
