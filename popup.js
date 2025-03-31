document.getElementById("extractButton").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        function: extractAssignments,
      });
    }
  });
});

// This function is injected into the active page.
function extractAssignments() {
  // XPath helper functions.
  function xpathFirst(node, xpath) {
    return document.evaluate(
      xpath,
      node,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;
  }
  function xpathAll(node, xpath) {
    let results = [];
    let query = document.evaluate(
      xpath,
      node,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    for (let i = 0; i < query.snapshotLength; i++) {
      results.push(query.snapshotItem(i));
    }
    return results;
  }

  // Find all assignment nodes (elements with both "assignment" and "todo" classes).
  let assignmentNodes = xpathAll(
    document,
    "//li[contains(@class, 'assignment') and contains(@class, 'todo')]"
  );

  // Build rows with header.
  let rows = [];
  rows.push(["Project", "List", "Todo", "Due Date", "URL"]);

  assignmentNodes.forEach(function (assignment) {
    // PROJECT: Get project name from the nearest turbo-frame's <h2><a>.
    let bucketFrame = xpathFirst(
      assignment,
      "ancestor::turbo-frame[starts-with(@id, 'assignments_bucket_')]"
    );
    let project = "";
    if (bucketFrame) {
      let bucketLink = xpathFirst(bucketFrame, ".//h2//a");
      if (bucketLink) {
        project = bucketLink.textContent.trim();
      }
    }

    // LIST: Get list name from the closest <article>'s <h3><a>.
    let articleElem = xpathFirst(assignment, "ancestor::article[1]");
    let listName = "";
    if (articleElem) {
      let listLink = xpathFirst(articleElem, ".//h3//a");
      if (listLink) {
        listName = listLink.textContent.trim();
      }
    }

    // TODO and URL: Extract todo title and URL from the first <a> in .checkbox__content.
    let todoLink = xpathFirst(
      assignment,
      ".//div[contains(@class, 'checkbox__content')]/a"
    );
    let todoTitle = "";
    let todoUrl = "";
    if (todoLink) {
      todoTitle = todoLink.textContent.trim();
      todoUrl = todoLink.getAttribute("href") || "";
      if (todoUrl && !todoUrl.startsWith("http")) {
        todoUrl = window.location.origin + todoUrl;
      }
    }

    // DUE DATE: Look for an element with class "todo__date".
    let dueDateElem = xpathFirst(
      assignment,
      ".//span[contains(@class, 'todo__date')]"
    );
    let formattedDueDate = "";
    if (dueDateElem) {
      let dueDateText = dueDateElem.textContent.trim();
      // If the date starts with a weekday (e.g. "Wed, Apr 30"), remove the weekday and add current year.
      if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i.test(dueDateText)) {
        dueDateText = dueDateText.replace(
          /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun),\s*/i,
          ""
        );
        dueDateText += " " + new Date().getFullYear();
      }
      // Otherwise, assume it’s in full format (e.g. "Mar 17, 2026").
      let dateObj = new Date(dueDateText);
      if (!isNaN(dateObj.getTime())) {
        let dd = ("0" + dateObj.getDate()).slice(-2);
        let mm = ("0" + (dateObj.getMonth() + 1)).slice(-2);
        formattedDueDate = `${dd}/${mm}/${dateObj.getFullYear()}`;
      }
    }

    rows.push([project, listName, todoTitle, formattedDueDate, todoUrl]);
  });

  // Build a tab-separated string (TSV) so that pasting into Google Sheets splits into columns.
  let tsvContent = rows.map((row) => row.join("\t")).join("\n");

  // Try using the Clipboard API. If it fails, use a fallback.
  function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.top = "0";
    textArea.style.left = "0";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      let successful = document.execCommand("copy");
      if (successful) {
        console.log("Fallback: Data copied to clipboard:\n" + text);
        alert("Assignments copied to clipboard (fallback)!");
      } else {
        console.error("Fallback: Copy command was unsuccessful.");
      }
    } catch (err) {
      console.error("Fallback: Unable to copy", err);
    }
    document.body.removeChild(textArea);
  }

  navigator.clipboard
    .writeText(tsvContent)
    .then(() => {
      console.log("Data copied to clipboard:\n" + tsvContent);
      alert("Assignments copied to clipboard!");
    })
    .catch((err) => {
      console.error("Clipboard API failed:", err);
      fallbackCopy(tsvContent);
    });
}
