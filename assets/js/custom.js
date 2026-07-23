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
    var leaderboardList = directory.querySelector("#travel-ranking-list");
    var voteStatus = directory.querySelector("#travel-recommendation-status");
    var voteSummary = directory.querySelector("#travel-recommendation-summary");
    var refreshButton = directory.querySelector("#travel-recommendation-refresh");
    var confirmButton = directory.querySelector("#travel-recommendation-confirm");
    var selectionCount = directory.querySelector("#travel-selection-count");
    var selectionLimit = directory.querySelector("#travel-selection-limit");

    if (!voteButtons.length || !leaderboardList) {
      return;
    }

    var voteEndpoint = directory.getAttribute("data-supabase-function-url");
    var supabaseKey = directory.getAttribute("data-supabase-key");
    var countries = {};
    var voteCounts = {};
    var participantCount = null;
    var confirmedCountries = [];
    var draftCountries = [];
    var maxVotes = 5;
    var isSaving = false;
    var voterStorageKey = "travel-footprint-voter-id";
    var browserVoterId = "";

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

    function createBrowserVoterId() {
      if (window.crypto && typeof window.crypto.randomUUID === "function") {
        return window.crypto.randomUUID().toLowerCase();
      }

      var bytes = new Uint8Array(16);

      if (window.crypto && typeof window.crypto.getRandomValues === "function") {
        window.crypto.getRandomValues(bytes);
      } else {
        bytes.forEach(function (_value, index) {
          bytes[index] = Math.floor(Math.random() * 256);
        });
      }

      return Array.from(bytes)
        .map(function (byte) {
          return byte.toString(16).padStart(2, "0");
        })
        .join("");
    }

    function getBrowserVoterId() {
      if (browserVoterId) {
        return browserVoterId;
      }

      try {
        var storedVoterId = window.localStorage.getItem(voterStorageKey) || "";

        if (/^[a-f0-9-]{32,36}$/.test(storedVoterId)) {
          browserVoterId = storedVoterId;
          return browserVoterId;
        }

        browserVoterId = createBrowserVoterId();
        window.localStorage.setItem(voterStorageKey, browserVoterId);
      } catch (_error) {
        browserVoterId = createBrowserVoterId();
      }

      return browserVoterId;
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

    function renderLeaderboard() {
      var rankedCountries = Object.keys(countries)
        .filter(function (country) {
          return Number(voteCounts[country] || 0) > 0;
        })
        .sort(function (firstCountry, secondCountry) {
          var countDifference = Number(voteCounts[secondCountry]) - Number(voteCounts[firstCountry]);
          return countDifference || firstCountry.localeCompare(secondCountry);
        });

      leaderboardList.innerHTML = "";

      if (!rankedCountries.length) {
        var emptyMessage = document.createElement("li");
        emptyMessage.className = "travel-leaderboard__empty";
        emptyMessage.textContent = "No confirmed votes yet. Be the first to choose a destination.";
        leaderboardList.appendChild(emptyMessage);
        return;
      }

      rankedCountries.forEach(function (country, index) {
        var count = Number(voteCounts[country]);
        var item = document.createElement("li");
        var rank = document.createElement("span");
        var flag = document.createElement("span");
        var name = document.createElement("strong");
        var total = document.createElement("span");

        item.className = "travel-leaderboard__item";
        item.setAttribute(
          "aria-label",
          "Rank " + (index + 1) + ": " + country + ", " + count + (count === 1 ? " vote" : " votes")
        );
        rank.className = "travel-leaderboard__rank";
        rank.textContent = index + 1;
        flag.className = "travel-leaderboard__flag";
        flag.setAttribute("aria-hidden", "true");
        flag.textContent = countries[country].flag;
        name.className = "travel-leaderboard__name";
        name.textContent = country;
        total.className = "travel-leaderboard__total";
        total.textContent = count + (count === 1 ? " vote" : " votes");

        item.appendChild(rank);
        item.appendChild(flag);
        item.appendChild(name);
        item.appendChild(total);
        leaderboardList.appendChild(item);
      });
    }

    function renderVoteSummary() {
      if (!voteSummary) {
        return;
      }

      voteSummary.hidden = participantCount === null;

      if (participantCount === null) {
        return;
      }

      voteSummary.textContent =
        participantCount === 1
          ? "1 person voted so far"
          : participantCount + " people voted so far";
    }

    function renderConfirmButton() {
      if (selectionCount) {
        selectionCount.textContent = draftCountries.length;
      }

      if (selectionLimit) {
        selectionLimit.textContent = maxVotes;
      }

      if (!confirmButton) {
        return;
      }

      confirmButton.disabled =
        directory.getAttribute("data-voting-ready") !== "true" ||
        isSaving ||
        selectionsMatch();
      confirmButton.textContent = isSaving ? "Confirming..." : "Confirm votes";
    }

    function renderVoting() {
      renderVoteButtons();
      renderLeaderboard();
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
      participantCount =
        typeof payload.participant_count === "number"
          ? Math.max(0, payload.participant_count)
          : null;
      draftCountries = confirmedCountries.slice();
      maxVotes = Number(payload.max_votes || 5);
    }

    async function requestVoteState(options) {
      var response = await window.fetch(voteEndpoint, {
        method: options && options.method ? options.method : "GET",
        headers: {
          apikey: supabaseKey,
          "Content-Type": "application/json",
          "x-voter-id": getBrowserVoterId()
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
          refreshButton.textContent = "Refresh ranking";
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
      setVoteStatus("Confirming your votes...", false);
      renderVoting();

      try {
        var payload = await requestVoteState({
          method: "POST",
          body: {
            destinations: draftCountries.slice()
          }
        });
        applyVoteState(payload);
        setVoteStatus("Your votes were confirmed.", false);
      } catch (error) {
        setVoteStatus(
          error.code === "vote_limit_reached"
            ? "Choose no more than five destinations."
            : "We could not confirm your votes. Please try again.",
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
