import { parsePhoneNumberFromString } from 'libphonenumber-js';
import emojiFlags from 'emoji-flags';
import usAreaCodes from '../data/usAreaCodes.json';


function detectCountryRegionCode(fullNumber: string): string | null {
    const phoneNumber = parsePhoneNumberFromString(fullNumber);
    if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.country || null;
    }
    return null;
}

function showCountryFlag(fullNumber: string) {
    const flagDisplay = document.getElementById('flagDisplay');
    if (!flagDisplay) return;

    flagDisplay.innerHTML = '';

    const regionCode = detectCountryRegionCode(fullNumber);
    if (regionCode) {
        const flagData = emojiFlags.countryCode(regionCode);
        if (flagData) {
            flagDisplay.innerHTML = `
        <span>Country/Region: ${flagData.name}</span>
        <span class="flag-display">${flagData.emoji}</span>
      `;
        }
    }
}

function formatPhoneNumberInput(fullNumber: string): string {
    const phoneNumber = parsePhoneNumberFromString(fullNumber);
    if (phoneNumber && phoneNumber.isValid()) {
        if (phoneNumber.country === 'US') {
            if (phoneNumber.country === 'US') {
                const n = phoneNumber.nationalNumber;
                return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
            }
        } else {
            return phoneNumber.formatInternational();
        }
    }
    return fullNumber;
}

// function handleUSAutoFormat(phoneInput: HTMLInputElement) {
//     const current = phoneInput.value.replace(/\D/g, '');
//     if (current.length <= 3) {
//         phoneInput.value = `(${current}`;
//     } else if (current.length <= 6) {
//         phoneInput.value = `(${current.slice(0, 3)}) ${current.slice(3)}`;
//     } else if (current.length <= 10) {
//         phoneInput.value = `(${current.slice(0, 3)}) ${current.slice(3, 6)}-${current.slice(6)}`;
//     } else {
//         phoneInput.value = `(${current.slice(0, 3)}) ${current.slice(3, 6)}-${current.slice(6, 10)}`;
//     }
// }

function handleUSAutoFormat(phoneInput: HTMLInputElement) {
    const raw = phoneInput.value;
    const digits = raw.replace(/\D/g, '').slice(0, 10); // Allow max 10 digits
    const prevCursorPos = phoneInput.selectionStart || 0;

    let formatted = '';
    if (digits.length === 0) {
        formatted = '';
    } else if (digits.length <= 3) {
        formatted = `(${digits}`;
    } else if (digits.length <= 6) {
        formatted = `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    } else {
        formatted = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }

    phoneInput.value = formatted;

    // Try to preserve cursor position reasonably
    let nextCursorPos = formatted.length;

    if (raw.length > formatted.length) {
        // User hit backspace
        nextCursorPos = prevCursorPos - 1;
    } else if (raw.length < formatted.length) {
        // New formatting characters added
        nextCursorPos = prevCursorPos + (formatted.length - raw.length);
    }

    // Set new cursor position
    setTimeout(() => {
        phoneInput.setSelectionRange(nextCursorPos, nextCursorPos);
    }, 0);
}

function showUSAreaInfo(phoneValue: string) {
    const regionDisplay = document.getElementById('regionDisplay');
    if (!regionDisplay) return;

    const digits = phoneValue.replace(/\D/g, '');
    const areaCode = digits.slice(0, 3);

    if (areaCode.length === 3 && usAreaCodes[areaCode]) {
        const { city, state } = usAreaCodes[areaCode];
        regionDisplay.textContent = `📍 ${city}, ${state}`;
    } else {
        regionDisplay.textContent = '';
    }
}

async function checkPhoneNumber() {
    const phoneInput = document.getElementById('phoneNumber') as HTMLInputElement;
    const countryInput = document.getElementById('countryCode') as HTMLInputElement;
    const resultDiv = document.getElementById('result');
    const loadingDiv = document.getElementById('loading');

    if (!phoneInput || !countryInput || !resultDiv || !loadingDiv) return;

    resultDiv.innerHTML = '';
    const full = `${countryInput.value}${phoneInput.value}`.trim();

    if (!phoneInput.value.trim()) {
        resultDiv.innerHTML = '<p class="error">Please enter a phone number.</p>';
        return;
    }

    loadingDiv.style.display = 'block';

    try {
        const url = `/api/check?phoneNumber=${encodeURIComponent(full)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Network response was not OK');

        const data = await response.json();
        loadingDiv.style.display = 'none';

        if (data.isScam) {
            resultDiv.innerHTML = `
        <p><strong>Potential Scam Detected!</strong></p>
        <p>Details: ${data.details || 'No further info'}</p>
        <p>Scam Score: ${data.score || 'N/A'}</p>
      `;
        } else {
            resultDiv.innerHTML = `
        <p>It doesn't appear to be reported as a scam.</p>
        <p>Scam Score: ${data.score || 'N/A'}</p>
      `;
        }
    } catch (err: any) {
        loadingDiv.style.display = 'none';
        resultDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
}

window.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('phoneNumber') as HTMLInputElement;
    const countryInput = document.getElementById('countryCode') as HTMLInputElement;
    const checkBtn = document.getElementById('checkNumberBtn');

    if (!phoneInput || !countryInput || !checkBtn) return;

    // Reset default values
    countryInput.value = '+1';
    phoneInput.value = '';

    // Clean input to only allow digits and '+'
    countryInput.addEventListener('input', () => {
        countryInput.value = countryInput.value.replace(/[^\d+]/g, '');
    });
    console.log('Page loaded');
    console.log('Phone input:', phoneInput);
    console.log('Country input:', countryInput);
    console.log(`Country input value: \"${countryInput.value}\"`)
    phoneInput.addEventListener('input', () => {
        const full = `${countryInput.value}${phoneInput.value}`;
        const region = detectCountryRegionCode(full);

        showCountryFlag(full);

        if (countryInput.value === '+1') {
            handleUSAutoFormat(phoneInput);
            showUSAreaInfo(phoneInput.value)
        }

    });

    phoneInput.addEventListener('blur', () => {
        const full = `${countryInput.value}${phoneInput.value}`;
        const formatted = formatPhoneNumberInput(full);
        const phoneNumber = parsePhoneNumberFromString(full);

        if (phoneNumber?.country === 'US') {
            phoneInput.value = formatted;
        } else {
            phoneInput.value = formatted.replace(countryInput.value, '').trim();
        }
    });

    countryInput.addEventListener('input', () => {
        const full = `${countryInput.value}${phoneInput.value}`;
        showCountryFlag(full);
    });

    checkBtn.addEventListener('click', checkPhoneNumber);
});
