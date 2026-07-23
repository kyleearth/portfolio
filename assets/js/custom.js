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

    if (!voteButtons.length || !favoritesList) {
      return;
    }

    var voteEndpoint = directory.getAttribute("data-supabase-function-url");
    var supabaseKey = directory.getAttribute("data-supabase-key");
    var countries = {};
    var voteCounts = {};
    var selectedCountries = [];
    var busyCountries = {};
    var maxVotes = 5;

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
      voteStatus.classList.toggle("is-error", Boolean(isError));
    }

    function setVotingReady(isReady) {
      directory.setAttribute("data-voting-ready", isReady ? "true" : "false");

      voteButtons.forEach(function (button) {
        var country = button.getAttribute("data-country");
        button.disabled = !isReady || Boolean(busyCountries[country]);
      });
    }

    function renderVoteButtons() {
      var isReady = directory.getAttribute("data-voting-ready") === "true";
      var isAtLimit = selectedCountries.length >= maxVotes;

      voteButtons.forEach(function (button) {
        var country = button.getAttribute("data-country");
        var count = Number(voteCounts[country] || 0);
        var isSelected = selectedCountries.indexOf(country) !== -1;
        var isBusy = Boolean(busyCountries[country]);
        var countElement = button.querySelector("[data-vote-count]");
        var labelElement = button.querySelector("[data-vote-label]");
        var star = button.querySelector(".travel-unexplored__star");

        button.classList.toggle("is-recommended", isSelected);
        button.classList.toggle("is-loading", isBusy);
        button.setAttribute("aria-pressed", isSelected ? "true" : "false");
        button.setAttribute(
          "aria-label",
          (isSelected ? "Remove your vote from " : "Vote for ") + country + ". " + count + (count === 1 ? " vote." : " votes.")
        );
        button.disabled = !isReady || isBusy || (isAtLimit && !isSelected);

        if (countElement) {
          countElement.textContent = count;
        }

        if (labelElement) {
          labelElement.textContent = count === 1 ? "vote" : "votes";
        }

        if (star) {
          star.textContent = isBusy ? "…" : isSelected ? "★" : "☆";
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
        var isSelected = selectedCountries.indexOf(country) !== -1;
        var isAtLimit = selectedCountries.length >= maxVotes;
        var chip = document.createElement("button");
        chip.className = "travel-recommendation-chip";
        chip.classList.toggle("is-selected", isSelected);
        chip.type = "button";
        chip.textContent = countries[country].flag + " " + country + " · " + count;
        chip.setAttribute("aria-label", "Vote for " + country + ", currently " + count + (count === 1 ? " vote" : " votes"));
        chip.disabled =
          directory.getAttribute("data-voting-ready") !== "true" ||
          Boolean(busyCountries[country]) ||
          (isAtLimit && !isSelected);
        chip.addEventListener("click", function () {
          toggleVote(country);
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

    function renderVoting() {
      renderVoteButtons();
      renderFavorites();
      renderVoteSummary();
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

      selectedCountries = (payload.selected || []).filter(function (country) {
        return Boolean(countries[country]);
      });
      maxVotes = Number(payload.max_votes || 5);
    }

    function getSelectionStatus(prefix) {
      var activeVotes = selectedCountries.length;
      var remainingVotes = Math.max(0, maxVotes - activeVotes);
      var message = activeVotes + " of " + maxVotes + " votes used.";

      if (remainingVotes > 0) {
        message += " You can choose " + remainingVotes + (remainingVotes === 1 ? " more destination." : " more destinations.");
      } else {
        message += " Remove a selected destination before choosing another.";
      }

      return prefix ? prefix + " " + message : message;
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

      if (refreshButton) {
        refreshButton.disabled = true;
        refreshButton.textContent = "Refreshing...";
      }

      try {
        var payload = await requestVoteState();
        applyVoteState(payload);
        setVotingReady(true);
        renderVoting();
        setVoteStatus(
          getSelectionStatus(announceRefresh ? "Live totals refreshed." : "Choose up to five destinations."),
          false
        );
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

    async function toggleVote(country) {
      if (!voteEndpoint || busyCountries[country] || directory.getAttribute("data-voting-ready") !== "true") {
        return;
      }

      var shouldSelect = selectedCountries.indexOf(country) === -1;

      if (shouldSelect && selectedCountries.length >= maxVotes) {
        setVoteStatus("This network has already used all five votes. Remove one before choosing another.", true);
        return;
      }

      busyCountries[country] = true;
      renderVoting();
      setVoteStatus(shouldSelect ? "Recording your vote..." : "Removing your vote...", false);

      try {
        var payload = await requestVoteState({
          method: "POST",
          body: {
            destination: country,
            selected: shouldSelect
          }
        });
        applyVoteState(payload);
        setVoteStatus(
          getSelectionStatus(
            shouldSelect
              ? "Your vote for " + country + " was counted."
              : "Your vote for " + country + " was removed."
          ),
          false
        );
      } catch (error) {
        setVoteStatus(
          error.code === "vote_limit_reached"
            ? "This network has already used all five votes. Remove one before choosing another."
            : "We could not record that vote. Please try again.",
          true
        );
      } finally {
        delete busyCountries[country];
        renderVoting();
      }
    }

    voteButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        toggleVote(button.getAttribute("data-country"));
      });
    });

    if (refreshButton) {
      refreshButton.addEventListener("click", function () {
        loadVoteData(true);
      });
    }

    if (!voteEndpoint || !supabaseKey || typeof window.fetch !== "function") {
      setVotingReady(false);
      setVoteStatus("Live voting could not load. Please refresh the page and try again.", true);
      return;
    }

    loadVoteData(false);
  });
})();
