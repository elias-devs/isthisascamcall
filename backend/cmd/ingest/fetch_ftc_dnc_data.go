package main

import (
	"log"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"
)

// === Config ===
const FTC_ENDPOINT = "https://api.ftc.gov/v0/dnc-complaints"
var FTC_API_KEY string
const PAGE_LIMIT = 50

// === FTC Response Types ===
type FTCResponse struct {
	Data []FTCRecord `json:"data"`
	Meta struct {
		RecordsThisPage int `json:"records-this-page"`
	} `json:"meta"`
}

type FTCRecord struct {
	ID         string         `json:"id"`
	Attributes FTCAttributes  `json:"attributes"`
}

type FTCAttributes struct {
	CompanyPhoneNumber        string `json:"company-phone-number"`
	CreatedDate               string `json:"created-date"`
	ViolationDate             string `json:"violation-date"`
	ConsumerCity              string `json:"consumer-city"`
	ConsumerState             string `json:"consumer-state"`
	ConsumerAreaCode          string `json:"consumer-area-code"`
	Subject                   string `json:"subject"`
	RecordedMessageOrRobocall string `json:"recorded-message-or-robocall"`
}

// === Normalized Output Struct ===
type PhoneReport struct {
	PhoneNumber   string    `json:"phone_number"`
	Source        string    `json:"source"`
	ReportDate    time.Time `json:"report_date"`
	ViolationDate *time.Time `json:"violation_date,omitempty"`
	Subject       string    `json:"subject"`
	Robocall      bool      `json:"robocall"`
	City          string    `json:"consumer_city,omitempty"`
	State         string    `json:"consumer_state,omitempty"`
	AreaCode      string    `json:"consumer_area_code,omitempty"`
}

func main() {
	// Parse CLI flags
	var timeRange string
	var outputFile string
	flag.StringVar(&timeRange, "range", "day", "Range to fetch: day, week, all")
	flag.StringVar(&outputFile, "output", "", "Optional output file (JSON)")
	flag.Parse()

	// Determine time window
	end := time.Now().UTC()
	var start time.Time
	switch timeRange {
	case "day":
		start = end.Add(-24 * time.Hour)
	case "week":
		start = end.Add(-7 * 24 * time.Hour)
	case "all":
		start = time.Date(2015, 1, 1, 0, 0, 0, 0, time.UTC)
	default:
		fmt.Println("Invalid range: must be 'day', 'week', or 'all'")
		os.Exit(1)
	}

	// Collect all paginated results
	var allReports []PhoneReport
	offset := 0

	for {
		// Format timestamps
		fromStr := start.Format("2006-01-02 15:04:05")
		toStr := end.Format("2006-01-02 15:04:05")

		// Build paginated URL
		url := fmt.Sprintf("%s?api_key=%s&created_date_from=%s&created_date_to=%s&page[limit]=%d&page[offset]=%d",
			FTC_ENDPOINT, FTC_API_KEY, fromStr, toStr, PAGE_LIMIT, offset)

		resp, err := http.Get(url)
		if err != nil {
			fmt.Printf("Request error: %v\n", err)
			break
		}
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			fmt.Printf("Read error: %v\n", err)
			break
		}

		var result FTCResponse
		if err := json.Unmarshal(body, &result); err != nil {
			fmt.Printf("JSON decode error: %v\n", err)
			break
		}

		if len(result.Data) == 0 {
			break
		}

		for _, record := range result.Data {
			report, err := normalize(record)
			if err == nil {
				allReports = append(allReports, report)
			}
		}

		if result.Meta.RecordsThisPage < PAGE_LIMIT {
			break
		}

		offset += PAGE_LIMIT
	}

	// Output
	output, err := json.MarshalIndent(allReports, "", "  ")
	if err != nil {
		fmt.Printf("Error marshalling output: %v\n", err)
		os.Exit(1)
	}

	if outputFile != "" {
		err := os.WriteFile(outputFile, output, 0644)
		if err != nil {
			fmt.Printf("Error writing file: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("# Wrote %d records to %s\n", len(allReports), outputFile)
	} else {
		fmt.Println(string(output))
	}
}

// === Normalize FTC Record into PhoneReport ===
func normalize(record FTCRecord) (PhoneReport, error) {
	attr := record.Attributes

	reportDate, err := time.Parse("2006-01-02 15:04:05", attr.CreatedDate)
	if err != nil {
		return PhoneReport{}, err
	}

	var violationDate *time.Time
	if attr.ViolationDate != "" {
		if dt, err := time.Parse("2006-01-02 15:04:05", attr.ViolationDate); err == nil {
			violationDate = &dt
		}
	}

	return PhoneReport{
		PhoneNumber:   attr.CompanyPhoneNumber,
		Source:        "FTC",
		ReportDate:    reportDate,
		ViolationDate: violationDate,
		Subject:       attr.Subject,
		Robocall:      attr.RecordedMessageOrRobocall == "Y",
		City:          attr.ConsumerCity,
		State:         attr.ConsumerState,
		AreaCode:      attr.ConsumerAreaCode,
	}, nil
}

func init() {
    out, err := exec.Command("bash", "-c", "echo $FTC_API_KEY").Output()
    fmt.Println("DEBUG: ftc key = ", string(out))
    fmt.Println("DEBUG: error = ", err)
    FTC_API_KEY = os.Getenv("FTC_API_KEY")
    if FTC_API_KEY == "" {
 		fmt.Println("DEBUG: FTC_API_KEY is not visible at runtime")
		log.Fatal("Missing FTC_API_KEY")
	} else {
		fmt.Println("DEBUG: FTC_API_KEY available", FTC_API_KEY[:5], "...")
	}	
}
