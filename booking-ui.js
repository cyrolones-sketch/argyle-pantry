(function () {
  window.setupBookingTime = function (form, type) {
    const date = form.elements[type === "order" ? "pickupDate" : "date"];
    const time = form.elements[type === "order" ? "pickupTime" : "time"];
    const message = document.createElement("p");
    message.className = "time-availability field-wide";
    message.setAttribute("role", "status");
    time.closest("label").after(message);
    function refresh() {
      date.min = Pantry.nowParts().date;
      const previous = time.value;
      const slots = Pantry.slots(date.value, type);
      time.replaceChildren(new Option(date.value ? "Choose a time" : "Choose a date first", ""));
      slots.forEach(value => time.add(new Option(Pantry.formatTime(value), value)));
      if (slots.includes(previous)) time.value = previous;
      time.disabled = !date.value || !slots.length;
      date.setCustomValidity("");
      time.setCustomValidity("");
      message.textContent = !date.value ? "All times are in Hobart local time." : !slots.length ? (Pantry.schedule(date.value).closed ? "Closed on this date. Please choose another day." : "No times are available on this date. Please choose a later date.") : type === "order" ? "Allow at least 15 minutes for preparation. Busy periods may take longer. All times are in Hobart local time." : "Your table is subject to confirmation by the restaurant. All times are in Hobart local time.";
      if (date.value && !slots.length) date.setCustomValidity(message.textContent);
    }
    date.addEventListener("change", refresh);
    time.addEventListener("change", () => time.setCustomValidity(""));
    window.addEventListener("pageshow", refresh);
    setInterval(refresh, 60000);
    refresh();
    return function () {
      const error = Pantry.dateTimeError(date.value, time.value, type);
      if (error) { message.textContent = error; time.setCustomValidity(error); if (time.disabled) date.setCustomValidity(error); return false; }
      return true;
    };
  };
})();
