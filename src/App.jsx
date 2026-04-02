import { useEffect, useRef, useState } from "react";

const systemDateLabel = new Date().toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [busyAgentId, setBusyAgentId] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dashboard?.chat_history]);

  async function requestJson(url, options) {
    let response;

    try {
      response = await fetch(url, options);
    } catch {
      throw new Error("The API server is not reachable at http://127.0.0.1:8000. Start the backend and refresh the page.");
    }

    const raw = await response.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`The API returned a non-JSON response with status ${response.status}. Check that the backend is running cleanly.`);
      }
    }

    if (!response.ok) {
      const detail =
        data && typeof data === "object" && "detail" in data ? data.detail : `Request failed with status ${response.status}.`;
      throw new Error(detail);
    }

    if (!data) {
      throw new Error("The API returned an empty response.");
    }

    return data;
  }

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/dashboard");
      setDashboard(data);
    } catch (error) {
      setDashboard(null);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function runAgent(agentId) {
    setBusyAgentId(agentId);
    setErrorMessage("");
    try {
      const data = await requestJson(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setDashboard(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setBusyAgentId(null);
    }
  }

  async function uploadBoq() {
    if (!selectedFile) return;

    setUploadBusy(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/boq/upload", {
        method: "POST",
        headers: {
          "Content-Type": selectedFile.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-filename": selectedFile.name,
        },
        body: selectedFile,
      });
      setDashboard(data);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setUploadBusy(false);
    }
  }

  async function submitChat(event) {
    event.preventDefault();
    if (!chatInput.trim()) return;

    setChatBusy(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: chatInput }),
      });
      setDashboard(data);
      setChatInput("");
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setChatBusy(false);
    }
  }

  if (loading || !dashboard) {
    return (
      <div className="loading-shell">
        {errorMessage || "Loading BOQ agent console..."}
      </div>
    );
  }

  const { agents, planner, timeline, chat_history: chatHistory, project_summary: summary, boq_upload: boqUpload } = dashboard;
  const upcomingActivities = timeline.schedule.slice(0, 6);

  return (
    <main className="page-shell">
      {errorMessage ? <div className="loading-shell">{errorMessage}</div> : null}
      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Construction AI control room</p>
          <h1>Read the BOQ, split it by package, and turn it into a cleaner working schedule.</h1>
          <p className="hero-copy">
            This workspace is set up for the next step: importing an Excel BOQ, letting each agent read
            its package, and then assembling a time-based schedule you can adjust when site conditions change.
          </p>
          <div className="hero-notes">
            <span>Excel BOQ intake live</span>
            <span>Agent-by-agent extraction</span>
            <span>Project manager export</span>
          </div>
        </div>
        <div className="hero-stats">
          <article>
            <span>Agents</span>
            <strong>{agents.length}</strong>
          </article>
          <article>
            <span>Project start</span>
            <strong>{timeline.start_date}</strong>
          </article>
          <article>
            <span>Projected finish</span>
            <strong>{timeline.finish_date}</strong>
          </article>
          <article>
            <span>Today</span>
            <strong>{systemDateLabel}</strong>
          </article>
        </div>
      </section>

      <section className="workflow-strip">
        <article className="workflow-card">
          <span className="workflow-step">01</span>
          <div>
            <strong>Upload BOQ</strong>
            <p>Prepare the interface for an Excel-based BOQ intake flow.</p>
          </div>
        </article>
        <article className="workflow-card">
          <span className="workflow-step">02</span>
          <div>
            <strong>Run agents</strong>
            <p>Each specialist extracts scheduler-ready activities from its WBS package.</p>
          </div>
        </article>
        <article className="workflow-card">
          <span className="workflow-step">03</span>
          <div>
            <strong>Build schedule</strong>
            <p>The planner combines those outputs into a readable sequence and timeline.</p>
          </div>
        </article>
      </section>

      <section className="summary-strip">
        <div>
          <span>Total schedule days</span>
          <strong>{summary.total_duration_days}</strong>
        </div>
        <div>
          <span>Delay events logged</span>
          <strong>{summary.delay_events}</strong>
        </div>
        <div>
          <span>Last action</span>
          <strong>{summary.last_action}</strong>
        </div>
        <div>
          <span>Planner agent</span>
          <strong>{planner.name}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="left-column">
          <section className="panel intake-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">BOQ intake</p>
                <h2>Upload BOQ Excel</h2>
                <p className="section-copy">
                  Upload the BOQ workbook here, then let the project manager agent rebuild the time schedule
                  and prepare the Primavera P6 import workbook.
                </p>
              </div>
            </div>
            <div className="intake-shell">
              <div className="intake-dropzone">
                <strong>{selectedFile ? selectedFile.name : "Choose `.xlsx` BOQ file"}</strong>
                <span>{selectedFile ? "Ready to upload" : "Select a BOQ workbook to load into the workflow"}</span>
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                />
                <button className="run-button" type="button" onClick={uploadBoq} disabled={!selectedFile || uploadBusy}>
                  {uploadBusy ? "Uploading..." : "Upload BOQ Excel"}
                </button>
              </div>
              <div className="intake-info">
                <div>
                  <span>Expected input</span>
                  <strong>Excel BOQ sheet</strong>
                </div>
                <div>
                  <span>Parsing target</span>
                  <strong>Trade packages and quantities</strong>
                </div>
                <div>
                  <span>Final output</span>
                  <strong>Primavera P6 import workbook</strong>
                </div>
                <div>
                  <span>Latest upload</span>
                  <strong>{boqUpload.filename ?? "No file uploaded"}</strong>
                  <span>{boqUpload.status}</span>
                  <span>{boqUpload.uploaded_at ?? "Waiting for BOQ file"}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="section-head">
            <div>
              <p className="eyebrow">Specialist agents</p>
              <h2>Clear package cards for each BOQ extractor</h2>
              <p className="section-copy">
                Each card surfaces only the most useful information: what the agent reads, how it formats
                the output, and a short preview of the activities it produces.
              </p>
            </div>
          </div>

          <div className="agent-grid">
            {agents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="agent-card-top">
                  <span className="agent-seq">Agent {agent.sequence}</span>
                  <span className={`status-pill ${agent.status}`}>{agent.status}</span>
                </div>
                <h3>{agent.wbs_category}</h3>
                <p className="agent-name">{agent.agent_name}</p>
                <p className="agent-task">{agent.task}</p>
                <div className="agent-guidelines">
                  <span>{agent.language_guidelines.clarity}</span>
                  <span>{agent.language_guidelines.granularity}</span>
                </div>
                <div className="sample-list">
                  <div className="sample-list-head">
                    <span>Activity preview</span>
                  </div>
                  {agent.latest_output.slice(0, 2).map((item) => (
                    <div key={item["Activity Name"]}>
                      <strong>{item["Activity Name"]}</strong>
                      <span>{item.WBS}</span>
                    </div>
                  ))}
                </div>
                <button
                  className="run-button"
                  onClick={() => runAgent(agent.id)}
                  disabled={busyAgentId === agent.id}
                >
                  {busyAgentId === agent.id ? "Running..." : "Run agent"}
                </button>
              </article>
            ))}
          </div>
        </div>

        <div className="right-column">
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Final agent</p>
                <h2>{planner.name}</h2>
                <p className="section-copy">
                  The project manager agent reads the uploaded BOQ context, collects the specialist outputs,
                  rebuilds the schedule logic, and prepares the final Excel file for Primavera P6 import.
                </p>
              </div>
              <span className="planner-badge">P6-ready logic</span>
            </div>
            <p className="agent-name">{planner.role}</p>
            <p className="planner-goal">{planner.goal}</p>
            <div className="flow-list">
              {planner.flow.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <div className="planner-actions">
              <button
                className="run-button"
                onClick={() => runAgent(planner.id)}
                disabled={busyAgentId === planner.id}
              >
                {busyAgentId === planner.id ? "Building export..." : "Run Project Manager Agent"}
              </button>
              <a className="run-button export-link" href="/api/exports/primavera.xlsx" target="_blank" rel="noreferrer">
                Download Primavera Import XLSX
              </a>
              <p className="planner-export-note">
                Includes activity rows, FS relationships, and a review sheet with the current schedule dates.
              </p>
              <div className="planner-meta">
                <span>Status</span>
                <strong>{planner.status}</strong>
                <span>Last run</span>
                <strong>{planner.last_run ?? "Not run yet"}</strong>
                <span>Export updated</span>
                <strong>{planner.export_updated_at ?? "Not generated yet"}</strong>
              </div>
            </div>
          </section>

          <section className="panel timeline-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Live schedule</p>
                <h2>Upcoming schedule view</h2>
                <p className="section-copy">
                  Dates update whenever an agent reruns or a work-loss event is logged through chat.
                </p>
              </div>
              <span className="finish-date">{timeline.finish_date}</span>
            </div>

            <div className="schedule-list">
              {upcomingActivities.map((item) => (
                <article className="schedule-row" key={`${item.wbs}-${item.activity_name}`}>
                  <div className="schedule-cell schedule-main">
                    <span className="cell-label">Activity</span>
                    <strong>{item.activity_name}</strong>
                    <span>{item.wbs}</span>
                  </div>
                  <div className="schedule-cell">
                    <span className="cell-label">Dates</span>
                    <span>{item.start_date}</span>
                    <span>{item.finish_date}</span>
                  </div>
                  <div className="schedule-cell">
                    <span className="cell-label">Logic</span>
                    <span>{item.duration_days} days</span>
                    <span>{item.predecessors}</span>
                  </div>
                </article>
              ))}
            </div>
            <p className="schedule-note">
              Showing the next {upcomingActivities.length} activities to keep the screen lighter. The full
              schedule logic is still active in the backend.
            </p>

            <div className="event-list">
              <h3>Timeline events</h3>
              {timeline.events.length === 0 ? (
                <p>No delay events yet. The chatbot can log one if work stops.</p>
              ) : (
                timeline.events.map((eventItem) => (
                  <div className="event-row" key={eventItem.id}>
                    <strong>{eventItem.date}</strong>
                    <span>{eventItem.reason}</span>
                    <span>{eventItem.lost_days} lost day(s)</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="panel chat-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Project assistant</p>
                <h2>Simple, plain-language project actions</h2>
                <p className="section-copy">
                  Use plain language. The assistant can explain a package, rerun an agent, or push the
                  schedule if the site loses a day.
                </p>
              </div>
            </div>
            <div className="chat-feed">
              {chatHistory.map((entry, index) => (
                <article className={`chat-bubble ${entry.role}`} key={`${entry.role}-${index}`}>
                  <span>{entry.role === "assistant" ? "Assistant" : "You"}</span>
                  <p>{entry.content}</p>
                </article>
              ))}
              <div ref={messagesEndRef} />
            </div>
            <form className="chat-form" onSubmit={submitChat}>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder="Try: I couldn't work today, push the schedule by 1 day."
                rows={3}
              />
              <button type="submit" disabled={chatBusy}>
                {chatBusy ? "Thinking..." : "Send"}
              </button>
            </form>
          </section>
        </div>
      </section>
    </main>
  );
}

export default App;
