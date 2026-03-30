import os
import sys
import time
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait       # <--- NEW
from selenium.webdriver.support import expected_conditions as EC # <--- NEW
from webdriver_manager.chrome import ChromeDriverManager

# --- CONFIGURATION ---
USERNAME = "304827"
PASSWORD = "ttx12345678"
LOGIN_URL = "http://192.168.31.99/Login.aspx"
REPORT_URL = "http://192.168.31.99/Modules/Marketing/ReportYXDExport.aspx"

# Define download folder
# Use argument if provided (from server.js with ROOT_DIR), else default to ./Downloads
if len(sys.argv) > 1:
    DOWNLOAD_DIR = sys.argv[1]
else:
    DOWNLOAD_DIR = os.path.join(os.getcwd(), "Downloads")

if not os.path.exists(DOWNLOAD_DIR):
    os.makedirs(DOWNLOAD_DIR)

def run_headless_scraper():
    print("--- Starting Browser ---")
    
    chrome_options = Options()
    chrome_options.add_argument("--headless=new")  # Re-enabled Headless as requested
    
    print(f"DEBUG: Download Directory set to: {DOWNLOAD_DIR}")
    
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    chrome_options.add_experimental_option("prefs", prefs)

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    # driver.maximize_window() # Not needed for headless
    
    # Create a "Wait" tool that waits up to 30 seconds (Lowered from 60)
    wait = WebDriverWait(driver, 30)

    try:
        # --- LOGIN ---
        print("1. Logging in...")
        driver.get(LOGIN_URL)
        
        # Wait for username box to be visible, then type
        wait.until(EC.visibility_of_element_located((By.NAME, "Login1$UserName"))).send_keys(USERNAME)
        driver.find_element(By.NAME, "Login1$Password").send_keys(PASSWORD)
        
        # Click Login
        try:
            driver.find_element(By.NAME, "Login1$btnLogin").click()
        except:
            driver.find_element(By.ID, "Login1_btnLogin").click()
            
        # Wait for login to process (avoid race condition with next navigation)
        time.sleep(5)

        print("2. Login submitted. Going to Report Page...")
        
        # --- REPORT PAGE ---
        driver.get(REPORT_URL)
        
        print("3. Setting Dates and Clicking 'Query'...")

        # --- SET DATES ---
        # User requested: 2025-01-01 to Current Date
        start_date = "2025-01-01"
        end_date = datetime.now().strftime("%Y-%m-%d")

        # Wait for inputs to be visible
        print("   -> Waiting for start date input...")
        start_date_input = wait.until(EC.visibility_of_element_located((By.ID, "cphMain_cphMain_Search_rq1")))
        
        print("   -> Found input. Setting Start Date via JS...")
        # Use JS to set value to avoid triggering the WdatePicker popup
        driver.execute_script("arguments[0].value = arguments[1];", start_date_input, start_date)

        print("   -> Finding end date input...")
        end_date_input = driver.find_element(By.ID, "cphMain_cphMain_Search_rq2")
        
        print("   -> Setting End Date via JS...")
        driver.execute_script("arguments[0].value = arguments[1];", end_date_input, end_date)
        
        print(f"   Dates set: {start_date} to {end_date}")
        
        # --- THE FIX IS HERE ---
        # Instead of looking for Chinese text or a specific ID, we look for the LINK itself.
        # We look for any <a> tag that contains "lnkSearch" in its href attribute.
        query_btn = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, "a[href*='lnkSearch']")))
        query_btn.click()

        # B. WAIT for the report to generate (Explicit Wait for AJAX)
        print("4. Waiting for Report Generation (AJAX)...")
        
        # 1. First wait for the PostBack to start (give it a moment after click)
        time.sleep(1) 

        # 2. Wait for any active Ajax request to complete
        def ajax_complete(d):
            return d.execute_script("return typeof(Sys) === 'undefined' || Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack() === false;")
        
        try:
            wait.until(ajax_complete)
            print("   -> AJAX finished. Report should be ready.")
        except Exception as e:
            print(f"   -> Warning: AJAX wait timed out or failed: {e}")

        # Stability Pause: Give the DOM a moment to settle after AJAX finishes
        # This helps if there are client-side rendering delays after the data arrives
        time.sleep(2)

        # 3. Double check ReportViewer existence
        def report_viewer_ready(d):
            return d.execute_script("return (typeof Sys !== 'undefined') && (typeof Sys.Application !== 'undefined') && ($find('ctl00_ctl00_cphMain_cphMain_ReportViewer1') != null);")
        
        wait.until(report_viewer_ready)

        # C. EXECUTE THE EXPORT COMMAND
        print("5. Triggering Export Command...")
        
        # Retry logic for export command just in case
        export_success = False
        for i in range(5): # Increased retries to 5
            try:
                # Check if we are still loading
                is_loading = driver.execute_script("return Sys.WebForms.PageRequestManager.getInstance().get_isInAsyncPostBack();")
                if is_loading:
                    print(f"   -> Still loading (Attempt {i+1}). Waiting...")
                    time.sleep(2)
                    continue

                driver.execute_script("$find('ctl00_ctl00_cphMain_cphMain_ReportViewer1').exportReport('CSV');")
                print("   -> Export command sent via JS.")
                export_success = True
                break
            except Exception as e:
                print(f"   -> Export attempt {i+1} failed: {e}")
                time.sleep(2)
        
        if not export_success:
            raise Exception("Failed to trigger export after multiple attempts.")

        # D. Wait for download (File System Poll)
        print("6. Waiting for download to complete...")
        
        def wait_for_download(dir_path, timeout=60):
            end_time = time.time() + timeout
            while time.time() < end_time:
                files = os.listdir(dir_path)
                
                # Debug logging every 5 seconds (or if files found)
                if int(time.time()) % 5 == 0:
                    print(f"   -> Scanning {dir_path}: {files}")
                
                # Look for non-temporary files (Chrome uses .crdownload for partials)
                for fname in files:
                    if fname.endswith(".csv") or (not fname.endswith(".crdownload") and not fname.endswith(".tmp")):
                        # meaningful check: ensure file size > 0
                        full_path = os.path.join(dir_path, fname)
                        if os.path.getsize(full_path) > 0:
                            return full_path
                time.sleep(1)
            raise TimeoutError(f"Download timed out. Files found: {files}")

        downloaded_file = wait_for_download(DOWNLOAD_DIR)
        
        # Renaissance: Rename to safe ASCII name to avoid stdout encoding issues with Chinese chars
        safe_name = "safe_master_data.csv"
        safe_path = os.path.join(DOWNLOAD_DIR, safe_name)
        
        # Remove existing if any
        if os.path.exists(safe_path):
            os.remove(safe_path)
            
        os.rename(downloaded_file, safe_path)
        
        print(f"Done! File saved and renamed to: {safe_path}")
        
        # Return the SAFE path for subprocess caller
        return safe_path

    except Exception as e:
        print(f"An error occurred: {e}")
        # Only take a screenshot if something goes wrong
        try:
            driver.save_screenshot("error_screenshot.png")
            print("Saved 'error_screenshot.png' so you can see what the bot saw.")
        except:
            pass
        return None
        
    finally:
        driver.quit()

if __name__ == "__main__":
    result = run_headless_scraper()
    if result:
        # Print with special prefix for subprocess parsing
        print(f"RESULT:{result}")
        exit(0)
    else:
        exit(1)