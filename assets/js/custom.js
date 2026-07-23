(function () {
  document.addEventListener("DOMContentLoaded", function () {
    var directory = document.querySelector("[data-travel-directory]");

    if (!directory) {
      return;
    }

    var filters = directory.querySelectorAll(".travel-filter");
    var places = directory.querySelectorAll(".travel-country");
    var visibleCount = directory.querySelector("#travel-visible-count");

    filters.forEach(function (filterButton) {
      filterButton.addEventListener("click", function () {
        var target = filterButton.getAttribute("data-filter");
        var count = 0;

        filters.forEach(function (button) {
          var isActive = button === filterButton;
          button.classList.toggle("is-active", isActive);
          button.setAttribute("aria-pressed", isActive ? "true" : "false");
        });

        places.forEach(function (place) {
          var isVisible = target === "all" || place.getAttribute("data-region") === target;
          place.classList.toggle("is-hidden", !isVisible);
          place.setAttribute("aria-hidden", isVisible ? "false" : "true");

          if (isVisible) {
            count += 1;
          }
        });

        if (visibleCount) {
          visibleCount.textContent = count;
        }
      });
    });

    var recommendationButtons = directory.querySelectorAll(".travel-unexplored__country");
    var recommendationList = directory.querySelector("#travel-recommendation-list");
    var recommendationStatus = directory.querySelector("#travel-recommendation-status");
    var recommendationSummary = directory.querySelector("#travel-recommendation-summary");
    var recommendationClear = directory.querySelector("#travel-recommendation-clear");

    if (!recommendationButtons.length || !recommendationList) {
      return;
    }

    var storageKey = "kylewang-travel-recommendations";
    var countries = {};
    var recommendations = [];

    recommendationButtons.forEach(function (button) {
      var country = button.getAttribute("data-country");
      countries[country] = {
        button: button,
        flag: button.getAttribute("data-flag")
      };
    });

    try {
      var savedRecommendations = JSON.parse(window.localStorage.getItem(storageKey) || "[]");

      if (Array.isArray(savedRecommendations)) {
        recommendations = savedRecommendations.filter(function (country, index) {
          return countries[country] && savedRecommendations.indexOf(country) === index;
        });
      }
    } catch (error) {
      recommendations = [];
    }

    function saveRecommendations() {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(recommendations));
      } catch (error) {
        // The shortlist still works for this page view when browser storage is unavailable.
      }
    }

    function toggleRecommendation(country) {
      var existingIndex = recommendations.indexOf(country);

      if (existingIndex === -1) {
        recommendations.push(country);
      } else {
        recommendations.splice(existingIndex, 1);
      }

      saveRecommendations();
      renderRecommendations();
    }

    function renderRecommendations() {
      recommendationList.innerHTML = "";

      recommendationButtons.forEach(function (button) {
        var country = button.getAttribute("data-country");
        var isRecommended = recommendations.indexOf(country) !== -1;
        var star = button.querySelector(".travel-unexplored__star");

        button.classList.toggle("is-recommended", isRecommended);
        button.setAttribute("aria-pressed", isRecommended ? "true" : "false");
        button.setAttribute("aria-label", (isRecommended ? "Remove " : "Recommend ") + country);

        if (star) {
          star.textContent = isRecommended ? "★" : "☆";
        }
      });

      recommendations.forEach(function (country) {
        var chip = document.createElement("button");
        chip.className = "travel-recommendation-chip";
        chip.type = "button";
        chip.textContent = countries[country].flag + " " + country + " ×";
        chip.setAttribute("aria-label", "Remove " + country + " from recommendations");
        chip.addEventListener("click", function () {
          toggleRecommendation(country);
        });
        recommendationList.appendChild(chip);
      });

      recommendationList.hidden = recommendations.length === 0;

      if (recommendationStatus) {
        recommendationStatus.textContent = recommendations.length === 0
          ? "Select any country below to build a travel shortlist."
          : recommendations.length + (recommendations.length === 1 ? " place selected." : " places selected.");
      }

      if (recommendationSummary) {
        recommendationSummary.hidden = recommendations.length === 0;
        recommendationSummary.textContent = recommendations.length + " recommended";
      }

      if (recommendationClear) {
        recommendationClear.hidden = recommendations.length === 0;
      }
    }

    recommendationButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        toggleRecommendation(button.getAttribute("data-country"));
      });
    });

    if (recommendationClear) {
      recommendationClear.addEventListener("click", function () {
        recommendations = [];
        saveRecommendations();
        renderRecommendations();
      });
    }

    renderRecommendations();
  });
})();
