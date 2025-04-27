import com.google.i18n.phonenumbers.*;
import com.google.i18n.phonenumbers.geocoding.PhoneNumberOfflineGeocoder;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberType;
import com.google.i18n.phonenumbers.PhoneNumberUtil.PhoneNumberFormat;
import com.google.i18n.phonenumbers.PhoneNumberToCarrierMapper;
import com.google.i18n.phonenumbers.PhoneNumberToTimeZonesMapper;

import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpExchange;

import java.io.OutputStream;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.URI;
import java.util.*;
import java.util.stream.Collectors;
import java.util.logging.*;
import java.io.File;

import org.json.JSONObject;

public class NumberMetadataService {

    private static final PhoneNumberUtil phoneUtil = PhoneNumberUtil.getInstance();
    private static final PhoneNumberOfflineGeocoder geocoder = PhoneNumberOfflineGeocoder.getInstance();
    private static final PhoneNumberToCarrierMapper carrierMapper = PhoneNumberToCarrierMapper.getInstance();
    private static final PhoneNumberToTimeZonesMapper timeZoneMapper = PhoneNumberToTimeZonesMapper.getInstance();

    private static final int CACHE_SIZE = 1000;
    private static final Map<String, JSONObject> cache = Collections.synchronizedMap(
            new LinkedHashMap<String, JSONObject>(CACHE_SIZE, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, JSONObject> eldest) {
                    return size() > CACHE_SIZE;
                }
            }
    );

    private static final Logger logger = Logger.getLogger(NumberMetadataService.class.getName());

    static {
        try {
            File logDir = new File("log");
            if (!logDir.exists()) {
                if (!logDir.mkdir()) {
                    throw new IOException("Unable to create log directory in " + logDir + ". ");
                }
            }

            FileHandler fileHandler = new FileHandler("log/number_metadata_service.log", true);
            fileHandler.setFormatter(new SimpleFormatter());
            logger.addHandler(fileHandler);
        } catch (IOException e) {
            System.err.println("Failed to initialize file logger: " + e.getMessage());
        }
    }


    public static void main(String[] args) throws IOException {
        if (Arrays.asList(args).contains("-p")) {
            ConsoleHandler consoleHandler = new ConsoleHandler();
            consoleHandler.setFormatter(new SimpleFormatter());
            logger.addHandler(consoleHandler);
            logger.setUseParentHandlers(false);
            System.out.println("Console logging enabled.");
        } else {
            System.out.println("Console logging is disabled. Logs will be written to file only.");
            logger.setUseParentHandlers(false);
        }

        HttpServer server = HttpServer.create(new InetSocketAddress(8181), 0);
        server.createContext("/lookup", NumberMetadataService::handleLookup);
        server.setExecutor(null);
        System.out.println("Number Metadata Service running on http://localhost:8181/lookup");
        server.start();
    }

    private static void rejectRequest(HttpExchange exchange, int statusCode, String errorMessage) throws IOException {
        JSONObject errorJson = new JSONObject();
        errorJson.put("error", errorMessage);
        logger.warning("Rejected: " + errorMessage);
        sendResponse(exchange, statusCode, errorJson.toString());
    }

    private static void handleLookup(HttpExchange exchange) throws IOException {
        URI requestURI = exchange.getRequestURI();
        Map<String, String> queryParams = parseQueryParams(requestURI.getQuery());

        String number = queryParams.get("number");

        if (number == null || number.trim().isEmpty()) {
            rejectRequest(exchange, 400, "Missing 'number' parameter.");
            return;
        }

        number = number.trim();

        if (!number.startsWith("+")) {
            rejectRequest(exchange, 400, "Phone number must start with '+' " +
                    "followed by country code and number.");
            return;
        }

        String digitsOnly = number.substring(1);
        if (!digitsOnly.matches("\\d+")) {
            rejectRequest(exchange, 400,
                    "Phone number must contain only digits after '+'.");
            return;
        }

        if (digitsOnly.length() < 8 || digitsOnly.length() > 15) {
            rejectRequest(exchange, 400,
                    "Invalid phone number length. Must be between 8 and 15 digits.");
            return;
        }

        // Special cases for US numbers
        if (number.startsWith("+1")) {
            if (digitsOnly.length() != 11) {
                rejectRequest(exchange, 400, "US phone numbers must " +
                        "have exactly 10 digits after country code.");
                return;
            }
        }

        Phonenumber.PhoneNumber parsedNumber;
        try {
            parsedNumber = phoneUtil.parse(number, null);
        } catch (NumberParseException e) {

            rejectRequest(exchange, 400,
                    "Invalid phone number format: " + e.getMessage());
            return;
        }

        String regionCode = phoneUtil.getRegionCodeForNumber(parsedNumber);

        if (regionCode == null) {
            rejectRequest(exchange, 400, "Unable to determine region for " +
                    "this number (" + parsedNumber + "). Possible invalid or incomplete number.");
            return;
        }
        // All checks passed
        buildSuccessResponse(exchange, parsedNumber, regionCode);
    }



    private static Map<String, String> parseQueryParams(String query) {
        if (query == null || query.trim().isEmpty()) return Collections.emptyMap();
        return Arrays.stream(query.split("&"))
                .map(s -> s.split("=", 2))
                .collect(Collectors.toMap(a -> a[0], a -> a.length > 1 ? a[1] : ""));
    }

    private static void sendResponse(
            HttpExchange exchange, int statusCode, String responseBody) throws IOException {
        exchange.getResponseHeaders().add("Access-Control-Allow-Origin", "*"); // Allow all origins for development
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        byte[] responseBytes = responseBody.getBytes("UTF-8");
        exchange.sendResponseHeaders(statusCode, responseBytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(responseBytes);
        }
    }
    private static void buildSuccessResponse(HttpExchange exchange, Phonenumber.PhoneNumber parsedNumber, String regionCode) throws IOException {
        JSONObject responseJson = new JSONObject();

        String formatted = phoneUtil.format(parsedNumber, PhoneNumberFormat.NATIONAL);
        String location = geocoder.getDescriptionForNumber(parsedNumber, Locale.ENGLISH);
        String carrier = carrierMapper.getNameForNumber(parsedNumber, Locale.ENGLISH);
        PhoneNumberType numberType = phoneUtil.getNumberType(parsedNumber);
        List<String> timeZones = timeZoneMapper.getTimeZonesForNumber(parsedNumber);
        boolean isValid = phoneUtil.isValidNumber(parsedNumber);
        boolean isPossible = phoneUtil.isPossibleNumber(parsedNumber);
        boolean isValidForRegion = phoneUtil.isValidNumberForRegion(parsedNumber, regionCode);
        boolean isEmergency = ShortNumberInfo.getInstance().isEmergencyNumber("+" + parsedNumber.getCountryCode() + parsedNumber.getNationalNumber(), regionCode);
        Locale locale = new Locale.Builder().setRegion(regionCode).build();
        String countryName = locale.getDisplayCountry(Locale.ENGLISH);

        responseJson.put("input", "+" + parsedNumber.getCountryCode() + parsedNumber.getNationalNumber());
        responseJson.put("formatted", formatted);
        responseJson.put("country", countryName);
        responseJson.put("countryCode", "+" + parsedNumber.getCountryCode());
        responseJson.put("regionCode", regionCode);
        responseJson.put("location", location);
        responseJson.put("carrier", carrier);
        responseJson.put("lineType", numberType.toString());
        responseJson.put("timeZones", timeZones);
        responseJson.put("isValid", isValid);
        responseJson.put("isPossible", isPossible);
        responseJson.put("isEmergency", isEmergency);
        responseJson.put("isValidForRegion", isValidForRegion);

        cache.put(responseJson.getString("input"), responseJson);
        logger.info("Added to cache: " + responseJson.getString("input"));
        sendResponse(exchange, 200, responseJson.toString());
    }
}
