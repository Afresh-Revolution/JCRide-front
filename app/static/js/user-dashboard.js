(function () {
  "use strict";

  var btn = document.getElementById("referral-invite-btn");
  if (btn) {
    btn.addEventListener("click", function () {
      var url = btn.getAttribute("data-invite-url") || "";
      if (!url) return;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () {
          btn.textContent = "Link copied!";
        });
        return;
      }
      window.prompt("Copy your invite link:", url);
    });
  }
})();
