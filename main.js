document.getElementById('prediction-form').addEventListener('submit', async function(e) {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = document.getElementById('submit-btn');
  const statusMsg = document.getElementById('status-message');
  
  // 1. Collect Data
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  // 2. UI Loading State
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  statusMsg.classList.add('hidden');

  try {
    /** * IMPORTANT: You MUST replace this URL with your Google Apps Script Web App URL.
     * The gviz endpoint from your dashboard only READS data. You need a script to WRITE data.
     */
    const GOOGLE_SCRIPT_URL = "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL_HERE"; 
    
    // 3. Send Data to Google Sheets via POST request
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      }
    });

    if (response.ok) {
      // Success State
      statusMsg.className = "text-center text-sm font-bold py-3 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      statusMsg.innerHTML = '<i class="fa-solid fa-circle-check"></i> Predictions locked in successfully!';
      statusMsg.classList.remove('hidden');
      form.reset(); // Clear the form
    } else {
      throw new Error("Network response was not ok.");
    }

  } catch (error) {
    // Error State
    console.error("Submission failed:", error);
    statusMsg.className = "text-center text-sm font-bold py-3 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20";
    statusMsg.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Submission failed. Check connection or Apps Script URL.';
    statusMsg.classList.remove('hidden');
  } finally {
    // Reset Button State
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Submit Predictions</span> <i class="fa-solid fa-paper-plane"></i>';
  }
});
