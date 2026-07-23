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

    var voteButtons = directory.querySelectorAll(".travel-unexplored__country");
    var favoritesList = directory.querySelector("#travel-recommendation-list");
    var voteStatus = directory.querySelector("#travel-recommendation-status");
    var voteSummary = directory.querySelector("#travel-recommendation-summary");
    var refreshButton = directory.querySelector("#travel-recommendation-refresh");
    var confirmButton = directory.querySelector("#travel-recommendation-confirm");

    if (!voteButtons.length || !favoritesList) {
      return;
    }

    var voteEndpoint = directory.getAttribute("data-supabase-function-url");
    var supabaseKey = directory.getAttribute("data-supabase-key");
    var countries = {};
    var voteCounts = {};
    var confirmedCountries = [];
    var draftCountries = [];
    var maxVotes = 5;
    var isSaving = false;

    voteButtons.forEach(function (button) {
      var country = button.getAttribute("data-country");
      countries[country] = {
        button: button,
        flag: button.getAttribute("data-flag")
      };
      voteCounts[country] = 0;
    });

    function setVoteStatus(message, isError) {
      if (!voteStatus) {
        return;
      }

      voteStatus.textContent = message;
      voteStatus.hidden = !message;
      voteStatus.classList.toggle("is-error", Boolean(isError));
    }

    function setVotingReady(isReady) {
      directory.setAttribute("data-voting-ready", isReady ? "true" : "false");
    }

    function selectionsMatch() {
      if (confirmedCountries.length !== draftCountries.length) {
        return false;
      }

      return confirmedCountries.every(function (country) {
        return draftCountries.indexOf(country) !== -1;
      });
    }

    function renderVoteButtons() {
      var isReady = directory.getAttribute("data-voting-ready") === "true";
      var isAtLimit = draftCountries.length >= maxVotes;

      voteButtons.forEach(function (button) {
        var country = button.getAttribute("data-country");
        var count = Number(voteCounts[country] || 0);
        var isSelected = draftCountries.indexOf(country) !== -1;
        var countElement = button.querySelector("[data-vote-count]");
        var labelElement = button.querySelector("[data-vote-label]");

        button.classList.toggle("is-recommended", isSelected);
        button.classList.toggle("is-loading", isSaving);
        button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        button.setAttribute(
          "aria-label",
          (isSelected ? "Remove " : "Select ") + country + ". " + count + (count === 1 ? " vote." : " votes.")
        );
        button.disabled = !isReady || isSaving || (isAtLimit && !isSelected);

        if (countElement) {
          countElement.textContent = count;
        }

        if (labelElement) {
          labelElement.textContent = count === 1 ? "vote" : "votes";
        }
      });
    }

    function renderFavorites() {
      var favorites = Object.keys(countries)
        .filter(function (country) {
          return Number(voteCounts[country] || 0) > 0;
        })
        .sort(function (firstCountry, secondCountry) {
          var countDifference = Number(voteCounts[secondCountry]) - Number(voteCounts[firstCountry]);
          return countDifference || firstCountry.localeCompare(secondCountry);
        })
        .slice(0, 6);

      favoritesList.innerHTML = "";

      if (!favorites.length) {
        var emptyMessage = document.createElement("span");
        emptyMessage.className = "travel-recommendations__empty";
        emptyMessage.textContent = "No votes yet. Be the first to choose a destination.";
        favoritesList.appendChild(emptyMessage);
        return;
      }

      favorites.forEach(function (country) {
        var count = Number(voteCounts[country]);
        var isSelected = draftCountries.indexOf(country) !== -1;
        var isAtLimit = draftCountries.length >= maxVotes;
        var chip = document.createElement("button");
        chip.className = "travel-recommendation-chip";
        chip.classList.toggle("is-selected", isSelected);
        chip.type = "button";
        chip.textContent = countries[country].flag + " " + country + " · " + count;
        chip.setAttribute(
          "aria-label",
          (isSelected ? "Remove " : "Select ") + country + ", currently " + count + (count === 1 ? " vote" : " votes")
        );
        chip.disabled =
          directory.getAttribute("data-voting-ready") !== "true" ||
          isSaving ||
          (isAtLimit && !isSelected);
        chip.addEventListener("click", function () {
          toggleDraftSelection(country);
        });
        favoritesList.appendChild(chip);
      });
    }

    function renderVoteSummary() {
      if (!voteSummary) {
        return;
      }

      var totalVotes = Object.keys(voteCounts).reduce(function (total, country) {
        return total + Number(voteCounts[country] || 0);
      }, 0);

      voteSummary.hidden = false;
      voteSummary.textContent = totalVotes + (totalVotes === 1 ? " community vote" : " community votes");
    }

    function renderConfirmButton() {
      if (!confirmButton) {
        return;
      }

      confirmButton.disabled =
        directory.getAttribute("data-voting-ready") !== "true" ||
        isSaving ||
        selectionsMatch();
      confirmButton.textContent = isSaving ? "Confirming..." : "Confirm Selection";
    }

    function renderVoting() {
      renderVoteButtons();
      renderFavorites();
      renderVoteSummary();
      renderConfirmButton();
    }

    function applyVoteState(payload) {
      Object.keys(voteCounts).forEach(function (country) {
        voteCounts[country] = 0;
      });

      (payload.totals || []).forEach(function (row) {
        if (countries[row.destination]) {
          voteCounts[row.destination] = Number(row.vote_count || 0);
        }
      });

      confirmedCountries = (payload.selected || []).filter(function (country, index, selections) {
        return Boolean(countries[country]) && selections.indexOf(country) === index;
      });
      draftCountries = confirmedCountries.slice();
      maxVotes = Number(payload.max_votes || 5);
    }

    async function requestVoteState(options) {
      var response = await window.fetch(voteEndpoint, {
        method: options && options.method ? options.method : "GET",
        headers: {
          apikey: supabaseKey,
          "Content-Type": "application/json"
        },
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        cache: "no-store",
        credentials: "omit"
      });
      var payload = await response.json();

      if (!response.ok) {
        var requestError = new Error(payload.message || payload.error || "Voting request failed.");
        requestError.code = payload.error;
        requestError.status = response.status;
        throw requestError;
      }

      return payload;
    }

    async function loadVoteData(announceRefresh) {
      if (!voteEndpoint || !supabaseKey) {
        return false;
      }

      setVotingReady(false);
      setVoteStatus(announceRefresh ? "Refreshing live totals..." : "Loading live vote totals...", false);
      renderVoting();

      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";
      }

      try {
        var payload = await requestVoteState();
        applyVoteState(payload);
        setVotingReady(true);
        renderVoting();
        setVoteStatus(announceRefresh ? "Live totals refreshed." : "", false);
        return true;
      } catch (error) {
        setVotingReady(false);
        renderVoting();
        setVoteStatus("Live voting is temporarily unavailable. Please try again shortly.", true);
        return false;
      } finally {
        if (refreshButton) {
          refreshButton.disabled = false;
          refreshButton.textContent = "Refresh totals";
        }
      }
    }

    function toggleDraftSelection(country) {
      if (
        !countries[country] ||
        isSaving ||
        directory.getAttribute("data-voting-ready") !== "true"
      ) {
        return;
      }

      var selectedIndex = draftCountries.indexOf(country);

      if (selectedIndex === -1 && draftCountries.length >= maxVotes) {
        setVoteStatus("Choose no more than five destinations.", true);
        return;
      }

      if (selectedIndex === -1) {
        draftCountries.push(country);
      } else {
        draftCountries.splice(selectedIndex, 1);
      }

      setVoteStatus("", false);
      renderVoting();
    }

    async function confirmSelection() {
      if (
        !voteEndpoint ||
        isSaving ||
        selectionsMatch() ||
        directory.getAttribute("data-voting-ready") !== "true"
      ) {
        return;
      }

      isSaving = true;
      setVoteStatus("Confirming your selection...", false);
      renderVoting();

      try {
        var payload = await requestVoteState({
          method: "POST",
          body: {
            destinations: draftCountries.slice()
          }
        });
        applyVoteState(payload);
        setVoteStatus("Your selection was confirmed.", false);
      } catch (error) {
        setVoteStatus(
          error.code === "vote_limit_reached"
            ? "Choose no more than five destinations."
            : "We could not confirm your selection. Please try again.",
          true
        );
      } finally {
        isSaving = false;
        renderVoting();
      }
    }

    voteButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        toggleDraftSelection(button.getAttribute("data-country"));
      });
    });

    if (refreshButton) {
      refreshButton.addEventListener("click", function () {
        loadVoteData(true);
      });
    }

    if (confirmButton) {
      confirmButton.addEventListener("click", confirmSelection);
    }

    if (!voteEndpoint || !supabaseKey || typeof window.fetch !== "function") {
      setVotingReady(false);
      setVoteStatus("Live voting could not load. Please refresh the page and try again.", true);
      return;
    }

    loadVoteData(false);
  });
})();
