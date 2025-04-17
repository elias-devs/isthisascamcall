import { parsePhoneNumberFromString } from 'libphonenumber-js';
import emojiFlags from 'emoji-flags';
import usAreaCodes from '../data/usAreaCodes.json';
import {fetchPhoneMetadata} from "./PhoneLookup.ts";

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

    if (!phoneInput.value.trim()) {
        resultDiv.innerHTML = '<p class="error">Please enter a phone number.</p>';
        return;
    }

    loadingDiv.style.display = 'block';

    try {
        const [data, ok] = await fetchPhoneMetadata(countryInput, phoneInput);
        loadingDiv.style.display = 'none';
        if (data === undefined) throw new Error('Network response was not OK');
        if (!ok) {
            resultDiv.innerHTML = `<div class="error">${data.error || "Something went wrong."}</div>`;
            return;
        }


        if (data.error) {
            resultDiv.innerHTML = `<div class="error">${data.error}</div>`;
            return;
        }

        const output = `
      <div class="result-card">
        <h2>Phone Metadata</h2>
        <ul>
          <li><strong>Input:</strong> ${data.input}</li>
          <li><strong>Formatted:</strong> ${data.formatted}</li>
          <li><strong>Country:</strong> ${data.country} (${data.regionCode})</li>
          <li><strong>Location:</strong> ${data.location || 'N/A'}</li>
          <li><strong>Carrier:</strong> ${data.carrier || 'N/A'}</li>
          <li><strong>Time Zones:</strong> ${Array.isArray(data.timeZones) ? data.timeZones.join(", ") : 'N/A'}</li>
          <li><strong>Is Valid:</strong> ${data.isValid}</li>
          <li><strong>Is Possible:</strong> ${data.isPossible}</li>
          <li><strong>Is Emergency Number:</strong> ${data.isEmergency}</li>
        </ul>
      </div>
    `;
        resultDiv.innerHTML = output;

    } catch (err: any) {
        console.log("Found error in checkPhoneNumber: ", err.message);
        loadingDiv.style.display = 'none';
        resultDiv.innerHTML = `<div class="error">Error: ${err.message}</div>`;
    }
}





window.addEventListener('DOMContentLoaded', () => {
    const phoneInput = document.getElementById('phoneNumber') as HTMLInputElement;
    const countryInput = document.getElementById('countryCodeSelect') as HTMLSelectElement;
    const checkBtn = document.getElementById('checkNumberBtn');

    if (!phoneInput || !countryInput || !checkBtn) return;

    // Reset default values
    phoneInput.value = '';
    renderCountryDropDown(countryInput); // don't touch defaultIndex outside
    console.log('Page loaded');
    console.log('Phone input:', phoneInput);
    console.log('Country input:', countryInput);
    console.log(`Country input value: \"${countryInput.value}\"`)
    phoneInput.addEventListener('beforeinput', (e: InputEvent) => {
        const countryCode = countryInput.value;
        const currentDigits = phoneInput.value.replace(/\D/g, "");
        if (countryCode === "US" && currentDigits.length >= 10 && e.inputType.startsWith("insert")
            && !phoneInput.selectionStart && !phoneInput.selectionEnd) {
            e.preventDefault();
        }
    });
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
