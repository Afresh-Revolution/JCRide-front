(function () {
  function dismissFlash(button) {
    var flash = button.closest(".flash-dismissible");
    if (flash) flash.remove();
  }

  document.addEventListener(
    "click",
    function (event) {
      var button = event.target.closest(".flash-dismissible__close");
      if (!button) return;
      event.preventDefault();
      dismissFlash(button);
    },
    true
  );

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var button = event.target.closest(".flash-dismissible__close");
    if (!button) return;
    event.preventDefault();
    dismissFlash(button);
  });
})();
