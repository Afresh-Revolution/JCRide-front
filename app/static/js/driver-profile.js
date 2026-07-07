(function () {
  "use strict";

  var zone = document.querySelector("[data-profile-upload]");
  var fileInput = document.querySelector("[data-profile-file]");
  var filenameEl = document.querySelector("[data-profile-filename]");

  if (zone && fileInput && filenameEl) {
    function updateFileState() {
      var file = fileInput.files && fileInput.files[0];
      if (file) {
        filenameEl.textContent = file.name;
        zone.classList.add("is-selected");
      } else {
        filenameEl.textContent = "No file chosen";
        zone.classList.remove("is-selected");
      }
    }

    fileInput.addEventListener("change", updateFileState);
    updateFileState();
  }

  var openBtn = document.getElementById("vehicle-edit-open");
  var modal = document.getElementById("vehicle-edit-modal");
  if (!openBtn || !modal) return;

  function openModal() {
    if (typeof modal.showModal === "function") {
      modal.showModal();
    } else {
      modal.setAttribute("open", "open");
    }
  }

  function closeModal() {
    if (typeof modal.close === "function") {
      modal.close();
    } else {
      modal.removeAttribute("open");
    }
  }

  openBtn.addEventListener("click", openModal);

  modal.querySelectorAll("[data-vehicle-modal-close]").forEach(function (btn) {
    btn.addEventListener("click", closeModal);
  });

  modal.addEventListener("click", function (event) {
    if (event.target === modal) {
      closeModal();
    }
  });

  modal.querySelectorAll("[data-vehicle-photo]").forEach(function (input) {
    var nameEl = input.parentElement.querySelector("[data-vehicle-photo-name]");
    if (!nameEl) return;
    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      nameEl.textContent = file ? file.name : "No file chosen";
    });
  });
})();
