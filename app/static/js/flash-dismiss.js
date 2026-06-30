(function () {
  document.addEventListener("click", function (event) {
    var button = event.target.closest(".flash-dismissible__close");
    if (!button) return;
    var flash = button.closest(".flash-dismissible");
    if (flash) flash.remove();
  });
})();
