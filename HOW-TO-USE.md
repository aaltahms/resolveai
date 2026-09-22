# Using ResolveAI

**Start with Troubleshooting. You do not need to use every part of ResolveAI for one problem.**

Use the section menu to move between **Troubleshooting**, **Incident desk**, **Repair lab**, and **How to use**. On a wide screen it is on the left; on a small screen it is at the top. In Troubleshooting, search for a symptom (for example, “Wi-Fi” or “charging”), choose a case, then run its check. The Incident desk section links to both guided procedures and saved records.

## 1. Check a problem on your Mac

Open [ResolveAI](http://resolveai.localhost:4318/). Choose one of the twelve problem buttons, then press **Check**.

1. Read the **finding**: what ResolveAI actually observed.
2. Follow **What to do next** yourself. The app does not change your Mac.
3. Retry the thing that was failing, then press **Check again**.

**Example:** A website will not open. Choose **My internet isn’t working** → **Check my connection**. If the test websites work, try your failing website in a private window. Then recheck. “Can reach the internet” means those test connections worked; it does not mean your particular website is fixed.

For **An app isn’t responding**, run the check and select your app from the list. Its CPU and memory figures are clues. Try a harmless menu in that app to see whether it responds.

**Evidence and limitations** opens the supporting readings. It is optional. A missing reading means ResolveAI could not measure it, not that your Mac passed. These results disappear when you reload or switch problems; they are not automatically saved as incidents.

### The three hardware checks

- **My battery isn’t charging:** Read the charging state and power source. Recheck after a few minutes connected to power; this does not measure battery health.
- **I can’t hear any sound:** See the default output device, then compare it with Sound settings. Check volume and play sound yourself; ResolveAI does not play or record audio.
- **My external display isn’t appearing:** See which screens macOS lists. Compare the list with the monitor you expected, check its power/input and cable, then recheck. A listed display may still have a blank picture.

## 2. Keep a record in the incident desk

Use this when you want to document an investigation or demonstrate an IT support workflow. It is a separate app at [the incident desk](http://127.0.0.1:3000/), and needs its own server running.

An **incident** is a saved problem record: what failed, what you observed, what you tried, and whether it worked.

For your first practice record:

1. Open **Incident library**, choose **Service hostname cannot be resolved**, then **Create incident**. This is a supplied example, not an observation of your Mac.
2. Choose **Analyze saved evidence** to see which log lines support a possible explanation.
3. Open **Work notes** and record your investigation. When you have actually verified a fix, add that verification before resolving the record.
4. Use **Export report** to keep or show the investigation.

For a real problem, create an incident with your own non-sensitive observations. Mac-check results are not automatically copied here. Optional AI investigation uses a paid API; ordinary checks and rule-based log analysis do not need it.

## 3. Practice an approved repair in the lab

The [developer lab](http://resolveai.localhost:4318/lab) contains a separate sample app. Use it to learn the repair workflow or demonstrate the portfolio project.

Open **Test a problem** → **Block saving**. This deliberately blocks writes in the owned sample service. Wait for the monitor to detect the problem, then choose **Check the problem**. Read the proposal and choose **Apply this fix**. Finally, use **Try saving a note** to confirm saving works.

Those controls change only the sample service. They do not fix your Mac’s internet, storage, or other apps. You can return to **Mac checks** using the link at the top.

## Opening it later

The local address works on this Mac while ResolveAI’s server is running. Bookmark it. If your browser cannot resolve the named address, use [the numeric fallback](http://127.0.0.1:4318/).

If the page will not open, run the startup command in [README](README.md#start-the-mac-assistant). Keep that Terminal window open. To use the incident desk as well, the existing **Start Local Lab.command** starts both services; stop the current local runner before launching it so you do not start a second copy.

For everyday use: **choose a problem → check → try the suggested step → retry your original action → recheck**. The incident desk and lab are optional.

## Printing checks

Search for **printer** in Troubleshooting. Choose **I can’t find my printer**, **My print queue isn’t moving**, or **It’s using the wrong printer**. For queue trouble, select the affected printer after running the check. Read its status, then inspect the same queue in Print Center. Recheck after your own next step and confirm that your original document actually printed.

ResolveAI does not print a test page, cancel jobs, resume queues, or change the default. The default reported to the checker may differ from the printer selected in your app. If local printing access is unavailable, compare Printers & Scanners directly; this does not prove the printer is broken.

For USB or external storage trouble, open **Mac checks → External storage**. Choose the missing-drive or save-error case, run the check, and compare your intended volume with the readings. Open **Evidence and limitations** for mount status and incomplete readings. Follow the next step, then select **Check again**. These checks do not modify disks.

For meeting problems, open **Incident desk → Guided procedures** and search **meeting**. Choose microphone, camera, or screen sharing; record each observation, try the relevant next step yourself, and verify in the original app. Save the investigation to retain your notes. These are guided checks, not automatic device scans.
