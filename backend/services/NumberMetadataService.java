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
import java.util.regex.Pattern;
import java.util.regex.Matcher;
import java.util.concurrent.ConcurrentHashMap;
import java.util.logging.*;
import java.io.File;

import org.json.JSONObject;

public class NumberMetadataService {

    private static final PhoneNumberUtil phoneUtil = PhoneNumberUtil.getInstance();
    private static final PhoneNumberOfflineGeocoder geocoder = PhoneNumberOfflineGeocoder.getInstance();
    private static final PhoneNumberToCarrierMapper carrierMapper = PhoneNumberToCarrierMapper.getInstance();
    private static final PhoneNumberToTimeZonesMapper timeZoneMapper = PhoneNumberToTimeZonesMapper.getInstance();

    private static final int CACHE_SIZE = 500;
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
                logDir.mkdir();
            }
            FileHandler fh = new FileHandler("log/number_metadata_service.log", true);
            fh.setFormatter(new SimpleFormatter());
            logger.addHandler(fh);
            logger.setUseParentHandlers(false);
        } catch (IOException e) {
            System.err.println("Failed to initialize log handler: " + e.getMessage());
        }
    }

    public static void main(String[] args) throws IOException {
        HttpServer server = HttpServer.create(new InetSocketAddress(8181), 0);
        server.createContext("/lookup", NumberMetadataService::handleLookup);
        server.setExecutor(null);
        System.out.println("Number Metadata Service running on http://localhost:8080/lookup");
        server.start();
    }

    private static void handleLookup(HttpExchange exchange) throws IOException {
        URI requestURI = exchange.getRequestURI();
        Map<String, String> queryParams = parseQueryParams(requestURI.getQuery());

        String number = queryParams.get("number");
        JSONObject responseJson = new JSONObject();

        if (number == null || number.trim().isEmpty()) {
            responseJson.put("error", "Missing 'number' parameter.");
            logger.warning("Rejected: Missing 'number' parameter.");
            sendResponse(exchange, 400, responseJson.toString());
            return;
        }

        if (!number.matches("^\\+\\d{1,20}$")) {
            responseJson.put("error", "Invalid phone number format.");
            logger.warning("Rejected: Invalid format for number: " + number);
            sendResponse(exchange, 400, responseJson.toString());
            return;
        }

        if (cache.containsKey(number)) {
            logger.info("Cache hit for: " + number);
            sendResponse(exchange, 200, cache.get(number).toString());
            return;
        }

        try {
            Phonenumber.PhoneNumber parsedNumber = phoneUtil.parse(number, null);
            boolean isValid = phoneUtil.isValidNumber(parsedNumber);
            boolean isPossible = phoneUtil.isPossibleNumber(parsedNumber);
            String regionCode = phoneUtil.getRegionCodeForNumber(parsedNumber);
            String formatted = phoneUtil.format(parsedNumber, PhoneNumberFormat.NATIONAL);

            String location = geocoder.getDescriptionForNumber(parsedNumber, Locale.ENGLISH);
            String carrier = carrierMapper.getNameForNumber(parsedNumber, Locale.ENGLISH);
            PhoneNumberType numberType = phoneUtil.getNumberType(parsedNumber);
            List<String> timeZones = timeZoneMapper.getTimeZonesForNumber(parsedNumber);
//            PhoneNumberUtil.PhoneNumberCost cost = phoneUtil.getExpectedCost(parsedNumber);
            boolean isValidForRegion = regionCode != null && phoneUtil.isValidNumberForRegion(parsedNumber, regionCode);
            boolean isEmergency = ShortNumberInfo.getInstance().isEmergencyNumber(number, regionCode);
            Locale locale = new Locale.Builder().setRegion(regionCode).build();
            String countryName = locale.getDisplayCountry(Locale.ENGLISH);
            responseJson.put("input", number);
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
//            responseJson.put("costType", cost.toString());
            responseJson.put("isEmergency", isEmergency);
            responseJson.put("isValidForRegion", isValidForRegion);

            cache.put(number, responseJson);
            logger.info("Added to cache: " + number);
            sendResponse(exchange, 200, responseJson.toString());
        } catch (NumberParseException e) {
            responseJson.put("error", "Invalid phone number: " + e.getMessage());
            logger.warning("Rejected: Parse error for number: " + number + " - " + e.getMessage());
            sendResponse(exchange, 400, responseJson.toString());
        }
    }

    private static Map<String, String> parseQueryParams(String query) {
        if (query == null || query.trim().isEmpty()) return Collections.emptyMap();
        return Arrays.stream(query.split("&"))
                .map(s -> s.split("=", 2))
                .collect(Collectors.toMap(a -> a[0], a -> a.length > 1 ? a[1] : ""));
    }

    private static void sendResponse(HttpExchange exchange, int statusCode, String responseBody) throws IOException {
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(statusCode, responseBody.getBytes().length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(responseBody.getBytes());
        }
    }
}
