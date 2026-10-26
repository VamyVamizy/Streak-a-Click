const savedProgress = window.initialProgress || {};
const isAuthenticated = Boolean(window.isAuthenticated);

// variables
let clicks = Number(savedProgress.clicks) || 0;
let streak = Number(savedProgress.streak) || 1;
let streakLevel = Number(savedProgress.streakLevel) || 1;
let drainable = true;
let decreaseValue = Number(savedProgress.decreaseValue) || 50;
let force = Number(savedProgress.force) || 8;
let overclocked = Boolean(savedProgress.overclocked);
let criticalChance = Number(savedProgress.criticalChance) || 0.02;

//Click rate limit
const MAX_CLICKS_PER_SECOND = 25;
const CLICK_WINDOW_MS = 1000;
let recentClicks = [];

// button levels
let drainageLvl = Number(savedProgress.drainageLvl) || 1;
let forceLvl = Number(savedProgress.forceLvl) || 1;
let criticalLvl = Number(savedProgress.criticalLvl) || 1;

// upgrade costs
let drainageCost = Number(savedProgress.drainageCost) || 20;
let forceCost = Number(savedProgress.forceCost) || 100;
let criticalCost = Number(savedProgress.criticalCost) || 300;

//overclock
let overclockMultiplier = 2;
let overclockResistance = 6;

// elements
const button = document.querySelector('.btn');
const progressBar = document.querySelectorAll(".streakBar");
const lastBar = progressBar[progressBar.length - 1]; 
const upgradeBtn = document.getElementById('streakUp');
let strength = Number(savedProgress.strength) || parseFloat(document.getElementById('str').dataset.strength) || 1;
upgradeBtn.disabled = true;

progressBar.forEach((bar, index) => {
    const savedValue = Number(savedProgress.progressValues?.[index]);
    if (Number.isFinite(savedValue)) bar.value = Math.min(savedValue, Number(bar.max));
});
if (lastBar && lastBar.value >= lastBar.max) upgradeBtn.disabled = false;

function progressSnapshot() {
    return {
        clicks,
        streak,
        streakLevel,
        strength,
        decreaseValue,
        force,
        criticalChance,
        overclocked,
        drainageLvl,
        forceLvl,
        criticalLvl,
        drainageCost,
        forceCost,
        criticalCost,
        timeFreezeUnlocked,
        timeFreezeDuration,
        timeFreezeUpgradeCost,
        progressValues: Array.from(progressBar, bar => Number(bar.value))
    };
}

let saveInProgress = false;
async function saveProgress() {
    if (!isAuthenticated || saveInProgress) return;
    saveInProgress = true;
    try {
        await fetch('/api/progress', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(progressSnapshot()),
            keepalive: true
        });
    } finally {
        saveInProgress = false;
    }
}

function chance() {
    return Math.random() < (criticalChance);
}

// click button!
button.addEventListener('click', () => {
    const now = Date.now();
    recentClicks = recentClicks.filter(
        timestamp => now - timestamp < CLICK_WINDOW_MS
    );
    if(recentClicks.length >= MAX_CLICKS_PER_SECOND) {
        return;
    }
    recentClicks.push(now);
    const chanced = chance();
    const calc = (overclocked ? Math.floor((strength * streak) / overclockMultiplier) : strength * streak);
    clicks += chanced ? calc * 2 : calc;
    progressBar.forEach((bar, index) => {
        if (bar.classList.contains(`${streak}`)) {
            forceUpCalc = (overclocked ? (bar.value + (force - overclockResistance)) : bar.value + force);
            bar.value = chanced ? forceUpCalc * 1.5 : forceUpCalc;
            if (bar.value >= (streak * 100)) {
                if (bar == lastBar) {
                    drainable = false;
                    upgradeBtn.disabled = false;
                } else {
                    streak++;
                }
            }
        }
    });
});

// drain streak bar
setInterval(() => {
    if (drainable && !timeFreezeActive) {
        progressBar.forEach((bar, index) => {
            if (bar.classList.contains(`${streak}`)) {
                //decrease line
                bar.value = bar.value - (bar.max / decreaseValue);
                if (bar.value <= 0) {
                    streak = (streak == 1 ? streak = 1 : streak - 1);
                }
            }
        });
    }
}, 50);

// drainable tick
setInterval(() => {
    if (!drainable) drainable = true;
}, 3000);

// update txt
setInterval(() => {
    const streakText = document.getElementById('streakNum');
    const str = document.getElementById('str');
    streakText.textContent = `🔥${streak}x`;
    document.getElementById('overclock').textContent = `${overclocked ? 'Default Mode' : 'Resistant Ember Mode'}`;
    document.getElementById('clicks').textContent = clicks;
    str.textContent = `+${(overclocked ? Math.floor((strength * streak) / overclockMultiplier) : strength * streak)}`;
    if (streak >= 2) {
        streakText.classList.add('streaked');
        streakText.style.setProperty('--scale', `${(streak / 2)**(streak / 80) + 14}px`);
        str.style.setProperty('--color', 'linear-gradient(to right, orange, rgb(255, 123, 0))');
    } else {
        streakText.classList.remove('streaked');
        streakText.style.setProperty('--scale', `14px`);
        str.style.setProperty('--color', 'linear-gradient(to right, gray, gray)');
    }
    document.querySelectorAll('.updata').forEach((ud) => {
        const drain = ud.classList.contains("drainage");
        const isforce = ud.classList.contains("force");
        ud.querySelector(".lvl").textContent = `Lvl. ${drain ? drainageLvl : isforce ? forceLvl : criticalLvl}`;
        ud.querySelector(".cost").textContent = `${drain ? drainageCost : isforce ? forceCost : criticalCost} clicks`;
        ud.querySelector(".current").textContent = `${drain ? Math.round((100 / decreaseValue) * -10) / 10 : isforce} ${drain ? 'str/s' : 'str'}`;
    });
    document.getElementById("drainage").disabled = (clicks < drainageCost ? true : false);
    document.getElementById("force").disabled = (clicks < forceCost ? true : false);
    document.getElementById("critical").disabled = (clicks < criticalCost ? true : false);

    //Time Freeze UI
    timeFreezeBuyUpgrade.disabled = timeFreezeUnlocked ? (timeFreezeDuration >= timeFreezeMaxDuration || clicks < timeFreezeUpgradeCost)
    : clicks < timeFreezeCost;

    timeFreezeActivate.disabled = !timeFreezeUnlocked || timeFreezeActive;

    if (!timeFreezeUnlocked) {
        timeFreezeBuyUpgrade.textContent = `Unlock - ${timeFreezeCost} clicks`
    }
    timeFreezeDurationText.textContent = timeFreezeDuration.toFixed(1);

    //CPS
    document.getElementById('cps').textContent =
    recentClicks.filter(
        timestamp => Date.now() - timestamp < CLICK_WINDOW_MS
    ).length;
}, 50);

setInterval(saveProgress, 2000);
window.addEventListener('beforeunload', saveProgress);

upgradeBtn.addEventListener('click', async () => {
    if (upgradeBtn.disabled) return;
    streakLevel++;
    strength++;
    streak = 1;
    await saveProgress();
    window.location.reload();
});

//upgrade drain level
document.getElementById("drainage").addEventListener('click', () => {
    if (clicks >= drainageCost) {
        decreaseValue = decreaseValue + 2;
        clicks = clicks - drainageCost;
        drainageLvl++;
        drainageCost += 15;
    }
});

//upgrade force level
document.getElementById("force").addEventListener('click', () => {
    if (clicks >= forceCost) {
        force += 2;
        clicks = clicks - forceCost;
        forceLvl++;
        forceCost += 75;
    }
});

//upgrade force level
document.getElementById("critical").addEventListener('click', () => {
    if (clicks >= criticalCost) {
        criticalChance += 0.01;
        clicks = clicks - criticalCost;
        criticalLvl++;
        criticalCost += 80;
    }
});

// Time Freeze Upgrade
let timeFreezeUnlocked = false;
timeFreezeUnlocked = Boolean(savedProgress.timeFreezeUnlocked);
let timeFreezeDuration = Number(savedProgress.timeFreezeDuration) || 2;
let timeFreezeMaxDuration = 69696969696969696969696969;
let timeFreezeCost = 500;
let timeFreezeUpgradeCost = Number(savedProgress.timeFreezeUpgradeCost) || 1000;
let timeFreezeUpgradeCostExp = 1.2
let timeFreezeActive = false;
let timeFreezeCooldown = false;
const timeFreezeCooldownDuration = 60 * 1000
function roundtoNearestThousand(value) {
return Math.round(value /1000) * 1000;
}

const timeFreezeBuyUpgrade = document.getElementById('timeFreezeBuyUpgrade');
const timeFreezeActivate = document.getElementById('timeFreezeActivate');
const timeFreezeDurationText = document.getElementById('timeFreezeDuration');
const timeFreezeStatus = document.getElementById('timeFreezeStatus');

timeFreezeBuyUpgrade.addEventListener('click', () => {
if (!timeFreezeUnlocked) {
    if (clicks < timeFreezeCost) return;

    clicks -= timeFreezeCost;
    timeFreezeUnlocked = true;

    timeFreezeStatus.textContent = 'Ready';
    timeFreezeBuyUpgrade.textContent = `Upgrade - ${timeFreezeUpgradeCost} clicks`;
} else {
    if (timeFreezeDuration >= timeFreezeMaxDuration) return;
    if (clicks < timeFreezeUpgradeCost) return;
    clicks -= timeFreezeUpgradeCost;

    timeFreezeDuration = Math.min(
        timeFreezeDuration + 0.5, 
        timeFreezeMaxDuration
    );

    timeFreezeUpgradeCost = roundtoNearestThousand(timeFreezeUpgradeCost ** timeFreezeUpgradeCostExp);

    timeFreezeBuyUpgrade.textContent = 
    timeFreezeDuration >= timeFreezeMaxDuration ? 'Maximum Level' : `Upgrade - ${timeFreezeUpgradeCost} clicks`;

}

timeFreezeDurationText.textContent = timeFreezeDuration.toFixed(1); 

});
timeFreezeActivate.addEventListener('click', () => {
    if (!timeFreezeUnlocked || timeFreezeActive || timeFreezeCooldown) {
        return;
    }
    timeFreezeActive = true;
    timeFreezeCooldown = true;
    timeFreezeActivate.disabled = true;
    timeFreezeStatus.textContent = 'Time Frozen!';
    setTimeout(() => {
        timeFreezeActive = false;
        timeFreezeStatus.textContent = 'On cooldown (1:00)';
    }, timeFreezeDuration * 1000);
    let cooldownRemaining = timeFreezeCooldownDuration;
    const cooldownInterval = setInterval(() => {
        cooldownRemaining -= 1000;
        if (cooldownRemaining <= 0) {
            clearInterval(cooldownInterval);
            timeFreezeCooldown = false;
            timeFreezeActivate.disabled = false;
            timeFreezeStatus.textContent = 'Ready';
            return;
        }
        const minutes = Math.floor(cooldownRemaining / 60000);
        const seconds = Math.floor((cooldownRemaining % 60000) / 1000);

        timeFreezeStatus.textContent =
            `On cooldown (${minutes}:${String(seconds).padStart(2, '0')})`;
    }, 1000);
});

document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'f') {
        if (event.repeat) return;

        if (timeFreezeUnlocked && !timeFreezeActive) {
            timeFreezeActivate.click();
        }
    }
});

//overclock
document.getElementById("overclock").addEventListener('click', () => {
    overclocked = overclocked ? false : true;
    if (overclocked) {
        progressBar.forEach((pb) => {
            pb.style.setProperty('--gColor', 'linear-gradient(to right, rgb(187, 71, 152), rgb(221, 135, 135))');
        });
        document.getElementById("overclock").style.background = '#2563eb';
        document.querySelector(".hero").style.border = '3px solid rgb(187, 71, 152)';
        document.getElementById("mainBTN").style.background = 'linear-gradient(to right, rgb(187, 71, 152), rgb(221, 135, 135))';
    } else {
        progressBar.forEach((pb) => {
            pb.style.setProperty('--gColor', 'linear-gradient(to right, orange, rgb(255, 123, 0))');
        });
        document.getElementById("overclock").style.background = 'linear-gradient(to right, rgb(187, 71, 152), rgb(221, 135, 135))';
        document.querySelector(".hero").style.border = 'none';
        document.getElementById("mainBTN").style.background = '#2563eb';
    }
});

