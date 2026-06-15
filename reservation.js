const reservationForm = document.querySelector("#reservationForm");
const reservationMessage = document.querySelector("#reservationMessage");
const TRADING_OPEN = "10:00";
const TRADING_CLOSE = "20:30";

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

if (reservationForm) {
  const dateInput = reservationForm.querySelector('input[name="date"]');
  const timeInput = reservationForm.querySelector('input[name="time"]');
  if (dateInput) {
    dateInput.min = new Date().toISOString().slice(0, 10);
  }
  if (timeInput) {
    timeInput.min = TRADING_OPEN;
    timeInput.max = TRADING_CLOSE;
  }

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
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
      if (dateInput) dateInput.min = new Date().toISOString().slice(0, 10);
      if (timeInput) {
        timeInput.min = TRADING_OPEN;
        timeInput.max = TRADING_CLOSE;
      }
      setReservationMessage("Thank you. Your reservation request has been sent. A receipt has also been emailed to you.", "success");
    } catch (error) {
      const message = error instanceof TypeError
        ? "Reservation server is not running. Please try again later or call the restaurant."
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
