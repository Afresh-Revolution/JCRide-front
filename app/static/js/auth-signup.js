(function () {
  const RESEND_SECONDS = 60;

  function initOtp() {
    const otpWrap = document.querySelector("[data-otp-inputs]");
    const otpHidden = document.getElementById("otp_code");
    const otpForm = document.querySelector(".auth-signup__otp-form");
    if (!otpWrap || !otpHidden) return;

    const inputs = Array.from(otpWrap.querySelectorAll("input"));

    function syncHidden() {
      otpHidden.value = inputs.map((input) => input.value).join("");
    }

    inputs.forEach((input, index) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(-1);
        syncHidden();
        if (input.value && index < inputs.length - 1) {
          inputs[index + 1].focus();
        }
      });

      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && index > 0) {
          inputs[index - 1].focus();
        }
      });

      input.addEventListener("paste", (event) => {
        event.preventDefault();
        const pasted = (event.clipboardData || window.clipboardData)
          .getData("text")
          .replace(/\D/g, "")
          .slice(0, inputs.length);
        pasted.split("").forEach((digit, i) => {
          inputs[i].value = digit;
        });
        syncHidden();
        const focusIndex = Math.min(pasted.length, inputs.length - 1);
        inputs[focusIndex].focus();
      });
    });

    if (otpForm) {
      otpForm.addEventListener("submit", syncHidden);
    }

    if (inputs[0]) {
      inputs[0].focus();
    }
  }

  function initResendTimer() {
    const timerEl = document.querySelector("[data-resend-timer]");
    const resendBtn = document.querySelector("[data-resend-btn]");
    if (!timerEl) return;

    let remaining = RESEND_SECONDS;

    function render() {
      const minutes = Math.floor(remaining / 60);
      const seconds = remaining % 60;
      timerEl.textContent = `Resend code in ${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    function tick() {
      if (remaining <= 0) {
        timerEl.hidden = true;
        if (resendBtn) {
          resendBtn.hidden = false;
        }
        return;
      }
      render();
      remaining -= 1;
      window.setTimeout(tick, 1000);
    }

    if (resendBtn) {
      resendBtn.hidden = true;
    }
    timerEl.hidden = false;
    render();
    window.setTimeout(tick, 1000);
  }

  function initUploads() {
    document.querySelectorAll(".auth-signup__upload input[type='file']").forEach((input) => {
      input.addEventListener("change", () => {
        const slug = input.dataset.filenameTarget;
        const label = document.querySelector(`[data-filename="${slug}"]`);
        const row = input.closest(".auth-signup__upload");
        const name = input.files && input.files[0] ? input.files[0].name : "No file chosen";
        if (label) {
          label.textContent = name;
        }
        if (row) {
          row.classList.toggle("is-selected", Boolean(input.files && input.files[0]));
        }
      });
    });
  }

  initOtp();
  initResendTimer();
  initUploads();
})();
