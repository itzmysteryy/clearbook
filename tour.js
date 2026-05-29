// Clearbook Guided Welcome Tour Controller
import { Storage } from "./storage.js";

let currentStepIndex = 0;
const tourSteps = [
  {
    title: "Step 1: Dashboard",
    text: "Everything at a glance. Your financial health, right here. See net balance, SVG trend charts, recent items, and alerts.",
    getTarget: () => getNavElement("dashboard")
  },
  {
    title: "Step 2: Transactions",
    text: "Log every income and expense. Set up manual entries or recurring schedules, download templates, and import/export CSV sheets.",
    getTarget: () => getNavElement("transactions")
  },
  {
    title: "Step 3: Budget Planner",
    text: "Set custom budgets for any date range. Allocate category limits and see real-time color-coded progress bars as you spend.",
    getTarget: () => getNavElement("budgets")
  },
  {
    title: "Step 4: Savings Goals",
    text: "Set saving targets, assign customized emojis, track percentages completed, and celebrate major milestone milestones.",
    getTarget: () => getNavElement("savings-debts")
  },
  {
    title: "Step 5: Debt Tracker",
    text: "Know exactly what you owe and when you'll be free. Log payments to subtract balances and calculate estimated payoff dates.",
    getTarget: () => getNavElement("savings-debts")
  },
  {
    title: "Step 6: Spending Insights",
    text: "See exactly where your money goes. Drill-down category bars, check MoM trends, podium views, and income vs expense lines.",
    getTarget: () => getNavElement("insights")
  }
];

function getNavElement(targetName) {
  // Check if desktop sidebar is visible
  const isMobile = window.innerWidth <= 768;
  if (isMobile) {
    return document.querySelector(`#mobile-nav [data-target="${targetName}"]`);
  } else {
    return document.querySelector(`#sidebar [data-target="${targetName}"]`);
  }
}

export const WelcomeTour = {
  init() {
    // Add event listeners for tour navigation buttons
    document.getElementById("tour-btn-next").addEventListener("click", () => this.nextStep());
    document.getElementById("tour-btn-prev").addEventListener("click", () => this.prevStep());
    document.getElementById("tour-btn-skip").addEventListener("click", () => this.endTour());

    // Window resize handler to reposition spotlight
    window.addEventListener("resize", () => {
      if (document.getElementById("tour-overlay").classList.contains("active") && 
          document.getElementById("tour-splash").style.display === "none") {
        this.renderStep();
      }
    });

    window.startTourProgress = () => this.startTourSequence();
    window.skipTour = () => this.endTour();
  },

  checkAndStart() {
    if (!Storage.isTourCompleted()) {
      this.showWelcomeSplash();
    }
  },

  showWelcomeSplash() {
    const overlay = document.getElementById("tour-overlay");
    const splash = document.getElementById("tour-splash");
    const tooltip = document.getElementById("tour-tooltip");
    const spotlight = document.getElementById("tour-spotlight");

    overlay.classList.add("active");
    splash.style.display = "flex";
    tooltip.style.display = "none";
    spotlight.style.display = "none";
  },

  startTourSequence() {
    const splash = document.getElementById("tour-splash");
    const tooltip = document.getElementById("tour-tooltip");
    const spotlight = document.getElementById("tour-spotlight");

    splash.style.display = "none";
    tooltip.style.display = "flex";
    spotlight.style.display = "block";

    currentStepIndex = 0;
    this.renderStep();
  },

  renderStep() {
    const step = tourSteps[currentStepIndex];
    const targetElement = step.getTarget();

    // Update texts
    document.getElementById("tour-step-indicator").textContent = `Step ${currentStepIndex + 1} of ${tourSteps.length}`;
    document.getElementById("tour-text").textContent = step.text;

    // Toggle Prev button state
    document.getElementById("tour-btn-prev").style.visibility = currentStepIndex === 0 ? "hidden" : "visible";
    
    // Toggle Next button text on last step
    document.getElementById("tour-btn-next").textContent = currentStepIndex === tourSteps.length - 1 ? "Finish" : "Next";

    if (targetElement) {
      this.positionSpotlight(targetElement);
    } else {
      // If element is not found, fallback to screen center spotlighting
      this.positionSpotlightCenter();
    }
  },

  nextStep() {
    if (currentStepIndex < tourSteps.length - 1) {
      currentStepIndex++;
      this.renderStep();
    } else {
      this.endTour();
    }
  },

  prevStep() {
    if (currentStepIndex > 0) {
      currentStepIndex--;
      this.renderStep();
    }
  },

  positionSpotlight(element) {
    const rect = element.getBoundingClientRect();
    const spotlight = document.getElementById("tour-spotlight");
    const tooltip = document.getElementById("tour-tooltip");

    // Position spotlight ring
    spotlight.style.top = `${rect.top - 4 + window.scrollY}px`;
    spotlight.style.left = `${rect.left - 4 + window.scrollX}px`;
    spotlight.style.width = `${rect.width + 8}px`;
    spotlight.style.height = `${rect.height + 8}px`;
    spotlight.style.borderRadius = window.getComputedStyle(element).borderRadius || "12px";

    // Auto-scroll target into view if needed
    element.scrollIntoView({ behavior: "smooth", block: "center" });

    // Calculate tooltip coordinates
    setTimeout(() => {
      const updatedRect = element.getBoundingClientRect();
      let tooltipTop = updatedRect.bottom + 12 + window.scrollY;
      let tooltipLeft = updatedRect.left + (updatedRect.width - 280) / 2 + window.scrollX;

      // Adjust if it slips below viewport
      if (updatedRect.bottom + 220 > window.innerHeight) {
        tooltipTop = updatedRect.top - 200 + window.scrollY;
      }

      // Constrain inside horizontally
      if (tooltipLeft < 16) tooltipLeft = 16;
      if (tooltipLeft + 280 > window.innerWidth - 16) {
        tooltipLeft = window.innerWidth - 280 - 16;
      }

      tooltip.style.top = `${tooltipTop}px`;
      tooltip.style.left = `${tooltipLeft}px`;
    }, 100);
  },

  positionSpotlightCenter() {
    const spotlight = document.getElementById("tour-spotlight");
    const tooltip = document.getElementById("tour-tooltip");

    spotlight.style.width = "0px";
    spotlight.style.height = "0px";
    spotlight.style.top = "50%";
    spotlight.style.left = "50%";

    tooltip.style.top = "calc(50% - 100px)";
    tooltip.style.left = "calc(50% - 140px)";
  },

  endTour() {
    const overlay = document.getElementById("tour-overlay");
    overlay.classList.remove("active");
    Storage.setTourCompleted(true);
    
    // Celebration or greeting toast on completion
    this.showCompletionModal();
  },

  showCompletionModal() {
    const celebration = document.getElementById("milestone-celebration");
    const emoji = document.getElementById("celebration-emoji");
    const title = document.getElementById("celebration-title");
    const desc = document.getElementById("celebration-desc");

    if (celebration) {
      emoji.textContent = "🚀";
      title.textContent = "You're All Set!";
      desc.textContent = "Onboarding completed successfully. Welcome to Clearbook!";
      celebration.classList.add("active");
      
      window.dismissCelebration = () => {
        celebration.classList.remove("active");
      };
    }
  }
};
