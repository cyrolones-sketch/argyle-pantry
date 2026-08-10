const reservationForm = document.querySelector("#reservationForm");
const reservationMessage = document.querySelector("#reservationMessage");
const TRADING_OPEN = "11:30";
const TRADING_CLOSE = "20:30";
const SPECIAL_TRADING_DAYS = {
  "2026-08-14": { close: "18:00", message: "Argyle Pantry closes at 6:00pm on Friday 14 August 2026. Please choose a reservation time between 11:30am and 6:00pm." },
  "2026-08-16": { closed: true, message: "Argyle Pantry is closed on Sunday 16 August 2026. Please choose another reservation date." }
};

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
    dateInput.min = localDateValue(new Date());
    dateInput.addEventListener("change", () => {
      updateReservationTimeBounds(dateInput, timeInput);
      validateReservationDateTime(dateInput, timeInput);
    });
  }
  if (timeInput) {
    updateReservationTimeBounds(dateInput, timeInput);
    timeInput.addEventListener("input", () => validateReservationDateTime(dateInput, timeInput));
    timeInput.addEventListener("change", () => validateReservationDateTime(dateInput, timeInput));
  }

  reservationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateReservationDateTime(dateInput, timeInput)) {
      (dateInput && !dateInput.checkValidity() ? dateInput : timeInput)?.reportValidity();
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
      if (submitButton) submitButton.textContent = "Sending...";
      const payload = reservationPayload(reservationForm);
      const response = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(result.message || "Reservation could not be sent. Please try again.");
      }

      saveSubmissionSummary({
        type: "reservation",
        reservation: payload,
        receiptSent: result.receiptSent !== false,
        submittedAt: new Date().toISOString()
      });
      window.location.href = "success.html?type=reservation";
    } catch (error) {
      const message = error instanceof TypeError
        ? "The reservation service could not be reached. Please check your connection and try again."
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
  input.setCustomValidity(tradingScheduleForDate(input.value).closed ? tradingScheduleForDate(input.value).message : "");
  return input.checkValidity();
}

function validateReservationDateTime(dateInput, timeInput) {
  if (!dateInput || !timeInput) return true;

  dateInput.setCustomValidity("");
  timeInput.setCustomValidity("");
  updateReservationTimeBounds(dateInput, timeInput);
  const schedule = tradingScheduleForDate(dateInput.value);

  if (schedule.closed) {
    dateInput.setCustomValidity(schedule.message);
  }

  if (dateInput.checkValidity() && timeInput.value && !isWithinTradingHoursForDate(dateInput.value, timeInput.value)) {
    timeInput.setCustomValidity(`Reservation time must be between ${formatTime(schedule.open)} and ${formatTime(schedule.close)}.`);
  }

  return dateInput.checkValidity() && timeInput.checkValidity();
}

function updateReservationTimeBounds(dateInput, timeInput) {
  if (!timeInput) return;
  const schedule = tradingScheduleForDate(dateInput?.value || "");
  timeInput.min = schedule.open;
  timeInput.max = schedule.close;
}

function tradingScheduleForDate(dateValue) {
  const special = SPECIAL_TRADING_DAYS[dateValue];
  if (special?.closed) return { open: TRADING_OPEN, close: TRADING_CLOSE, closed: true, message: special.message };
  if (isSaturday(dateValue)) {
    return { open: TRADING_OPEN, close: TRADING_CLOSE, closed: true, message: "Argyle Pantry is closed on Saturdays. Please choose another day." };
  }
  return {
    open: TRADING_OPEN,
    close: special?.close || TRADING_CLOSE,
    closed: false,
    message: special?.message || ""
  };
}

function isWithinTradingHoursForDate(dateValue, timeValue) {
  const schedule = tradingScheduleForDate(dateValue);
  return !schedule.closed && /^\d{2}:\d{2}$/.test(timeValue) && timeValue >= schedule.open && timeValue <= schedule.close;
}

function formatTime(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  const suffix = hours >= 12 ? "pm" : "am";
  const displayHour = hours % 12 || 12;
  return minutes ? `${displayHour}:${String(minutes).padStart(2, "0")}${suffix}` : `${displayHour}${suffix}`;
}

function saveSubmissionSummary(summary) {
  try {
    sessionStorage.setItem("argylePantrySubmission", JSON.stringify(summary));
  } catch {
    // The success page still has a fallback if session storage is unavailable.
  }
}
