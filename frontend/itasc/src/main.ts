import { parsePhoneNumberFromString } from 'libphonenumber-js';
import emojiFlags from 'emoji-flags';
import usAreaCodes from '../data/usAreaCodes.json';

const typedAreaCodes = usAreaCodes as Record<string, {city: string, state: string}>


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
            const n = phoneNumber.nationalNumber;
            return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`;
        } else {
            return phoneNumber.formatInternational();
        }
    }
    return fullNumber;
}

function renderCountryDropDown(countrySelect: HTMLSelectElement) {
    let defaultIndex = 0;

    emojiFlags.data.forEach((flag, index) => {
        if (flag.dialCode) {
            const option = document.createElement('option');
            option.value = flag.code;
            option.setAttribute('data-dial-code', `${flag.dialCode}`);
            // option.label = `${flag.emoji} ${flag.code} (${flag.dialCode})`;
            option.text = `${flag.emoji} ${flag.name} (${flag.dialCode})`;
            option.title = `${flag.name} ${flag.code} (${flag.dialCode})`;

            countrySelect.appendChild(option);

            if (flag.code === "US") {
                defaultIndex = index;
            }
        }
    });

    // Set default after options are appended
    countrySelect.selectedIndex = defaultIndex;
    countrySelect.value = "US";

    countrySelect.addEventListener('change', () => {
        const selected = select.selectedOptions[0];
        countrySelect.title = selected.textContent || '';
    });

    const selectedOption = countrySelect.options[defaultIndex];
    const dialCode = selectedOption.getAttribute('data-dial-code') || '+1';
    showCountryFlag(dialCode);
}


function handleUSAutoFormat(phoneInput: HTMLInputElement) {
    // Capture the raw input and cursor position
    const raw = phoneInput.value;
    const rawCursorPos = phoneInput.selectionStart || 0;

    // Extract digits from the input
    const digits = raw.replace(/\D/g, '').slice(0, 10);

    // Count how many digits exist before the cursor in the original string
    const digitsBeforeCursor = raw.slice(0, rawCursorPos).replace(/\D/g, '').length;

    // Format the entire number according to digit count
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

    // Set the formatted value in the input
    phoneInput.value = formatted;

    // Calculate the new cursor position: advance through the formatted string
    // until we've passed the same number of digits as before the cursor.
    let newCursorPos = 0;
    let digitCount = 0;
    for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
            digitCount++;
        }
        if (digitCount >= digitsBeforeCursor) {
            newCursorPos = i + 1;
            break;
        }
    }

    // Fallback: if no digits found, place cursor at the end
    if (newCursorPos === 0) newCursorPos = formatted.length;

    // Update the cursor position asynchronously
    setTimeout(() => {
        phoneInput.setSelectionRange(newCursorPos, newCursorPos);
    }, 0);
}


function showUSAreaInfo(phoneValue: string) {
    const regionDisplay = document.getElementById('regionDisplay');
    if (!regionDisplay) return;

    const digits = phoneValue.replace(/\D/g, '');
    const areaCode = digits.slice(0, 3);

    if (areaCode.length === 3 && typedAreaCodes[areaCode]) {
        const { city, state } = typedAreaCodes[areaCode];
        regionDisplay.textContent = `📍 ${city}, ${state}`;
    } else {
        regionDisplay.textContent = '';
    }
}

async function checkPhoneNumber() {
    const phoneInput = document.getElementById('phoneNumber') as HTMLInputElement;
    const countryInput = document.getElementById('countryCodeSelect') as HTMLSelectElement;
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
        console.log("Found error in checkPhoneNumber: ", err.message)
        loadingDiv.style.display = 'none';
        resultDiv.innerHTML = `<p class="error">Error: ${err.message}</p>`;
    }
}



window.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('phoneNumber') as HTMLInputElement;
    const countryInput = document.getElementById('countryCodeSelect') as HTMLSelectElement;
    const checkBtn = document.getElementById('checkNumberBtn');

    if (!phoneInput || !countryInput || !checkBtn) return;

    // Reset default values
    countryInput.value = 'US';
    phoneInput.value = '';
    renderCountryDropDown(countryInput); // don't touch defaultIndex outside
    console.log('Page loaded');
    console.log('Phone input:', phoneInput);
    console.log('Country input:', countryInput);
    console.log(`Country input value: \"${countryInput.value}\"`)
    phoneInput.addEventListener('input', () => {
        const full = `${countryInput.value}${phoneInput.value}`;
        const region = detectCountryRegionCode(full);
        console.log("region: ", region)
        showCountryFlag(full);

        if (countryInput.value === 'US') {
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
    checkBtn.addEventListener('click', checkPhoneNumber);
});
