export type PhoneMetadata = {
  input: string;
  formatted?: string;
  country?: string;
  regionCode?: string;
  location?: string;
  carrier?: string;
  lineType?: string;
  timeZones?: string[];
  isValid?: boolean;
  isPossible?: boolean;
  costType?: string;
  isEmergency?: boolean;
  isValidForRegion?: boolean;
  error?: string;
};

export async function fetchPhoneMetadata(
    country: HTMLSelectElement,
    number: HTMLInputElement
): Promise<[PhoneMetadata, boolean]> {
  const baseUrl = "http://localhost:8181/lookup";
  const countryCode = country.options[country.selectedIndex].dataset.dialCode;

  if (!countryCode) {
    console.error("Error, country with no code given: ", country.value);
    const resultDiv = document.getElementById("result");
    if (resultDiv) {
      resultDiv.innerHTML = '<p class="error">Please select a country again.</p>';
    }
    return [{ input: "", error: "Missing country code" } as PhoneMetadata, false];
  }

  const phoneNumber = number.value.replace(/[^\d]/g, "");
  const fullNumber = `${countryCode}${phoneNumber}`;
  const url = `${baseUrl}?number=${encodeURIComponent(fullNumber)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();
    var errorBody : string = "";
    if (!res.ok) {
      // Handle known backend error gracefully
      if (data.error?.toLowerCase().includes("missing region code")) {
        errorBody = "Invalid phone number, area code wasn't recognized.";
      }
      const msg = errorBody || `Server returned status ${res.status}: ${res.statusText}`;
      return [{ input: fullNumber, error: msg } as PhoneMetadata, false];
    }

    return [data as PhoneMetadata, true];
  } catch (err: any) {
    console.error("Error contacting phone metadata service:", err);
    return [{ input: fullNumber, error: "Service error or unavailable" } as PhoneMetadata, false];
  }
}
