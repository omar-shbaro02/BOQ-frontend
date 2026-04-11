import { useEffect, useRef, useState } from "react";

const systemDateLabel = new Date().toLocaleDateString(undefined, {
  year: "numeric",
  month: "short",
  day: "numeric",
});

const apiBaseUrl = (import.meta.env.VITE_API_URL || "https://boq-backend-tfyq.onrender.com").replace(/\/$/, "");

function getApiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadDashboard();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [dashboard?.chat_history]);

  async function requestJson(url, options) {
    let response;
    try {
      response = await fetch(getApiUrl(url), options);
    } catch {
      throw new Error(`The API server is not reachable at ${apiBaseUrl}.`);
    }

    const raw = await response.text();
    let data = null;

    if (raw) {
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error(`The API returned a non-JSON response with status ${response.status}.`);
      }
    }

    if (!response.ok) {
      const detail = data && typeof data === "object" && "detail" in data ? data.detail : `Request failed with status ${response.status}.`;
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
      setDashboard(await requestJson("/api/dashboard"));
    } catch (error) {
      setDashboard(null);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
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

  async function runWorkflow() {
    setWorkflowBusy(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setDashboard(data);
    } catch (error) {
      setErrorMessage(error.message);
    } finally {
      setWorkflowBusy(false);
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
    return <div className="loading-shell">{errorMessage || "Loading BOQ workflow console..."}</div>;
  }

  const {
    agents,
    planner,
    timeline,
    workflow,
    boq_upload: boqUpload,
    chat_history: chatHistory,
    project_summary: summary,
  } = dashboard;

  const upcomingActivities = timeline.schedule.slice(0, 8);
  const readyToRun = Boolean(boqUpload.stored_path) && !workflowBusy;

  return (
    <main className="page-shell">
      {errorMessage ? <div className="loading-shell">{errorMessage}</div> : null}

      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Construction AI workflow</p>
          <h1>Upload the BOQ once, launch all specialists together, and export Primavera-ready logic.</h1>
          <p className="hero-copy">
            The specialist agents now run as one coordinated workflow. After upload, one run starts all package
            extractors in parallel, then the project manager compiles their outputs into the Excel import format.
          </p>
          <div className="hero-notes">
            <span>Parallel specialist run</span>
            <span>Project manager consolidation</span>
            <span>Primavera sample-aligned workbook</span>
          </div>
        </div>
        <div className="hero-stats">
          <article>
            <span>Agents</span>
            <strong>{agents.length}</strong>
          </article>
          <article>
            <span>Workflow</span>
            <strong>{workflow.status}</strong>
          </article>
          <article>
            <span>Finish</span>
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
            <p>Store the Excel workbook and prepare the backend parser.</p>
          </div>
        </article>
        <article className="workflow-card">
          <span className="workflow-step">02</span>
          <div>
            <strong>Run all specialists</strong>
            <p>All WBS extractors start together instead of being launched one by one.</p>
          </div>
        </article>
        <article className="workflow-card">
          <span className="workflow-step">03</span>
          <div>
            <strong>Export for Primavera</strong>
            <p>The project manager builds `TASK`, `TASKPRED`, and `USERDATA` sheets.</p>
          </div>
        </article>
      </section>

      <section className="summary-strip">
        <div>
          <span>Total schedule days</span>
          <strong>{summary.total_duration_days}</strong>
        </div>
        <div>
          <span>Primavera rows</span>
          <strong>{summary.primavera_rows}</strong>
        </div>
        <div>
          <span>Uploaded BOQ rows</span>
          <strong>{boqUpload.row_count ?? 0}</strong>
        </div>
        <div>
          <span>Last action</span>
          <strong>{summary.last_action}</strong>
        </div>
      </section>

      <section className="content-grid">
        <div className="left-column">
          <section className="panel intake-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Workflow intake</p>
                <h2>Upload the BOQ and run the full pipeline</h2>
                <p className="section-copy">
                  The full run now starts every package agent together, waits for them all to finish, and then lets the
                  project manager generate the Primavera import workbook in the sample structure you attached.
                </p>
              </div>
              <span className={`status-pill ${workflow.status}`}>{workflow.status}</span>
            </div>

            <div className="intake-shell">
              <div className="intake-dropzone">
                <strong>{selectedFile ? selectedFile.name : "Choose `.xlsx` BOQ file"}</strong>
                <span>{selectedFile ? "Ready to upload" : "Select the BOQ workbook that will drive all specialist agents"}</span>
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
                <button className="run-button secondary-button" type="button" onClick={runWorkflow} disabled={!readyToRun}>
                  {workflowBusy ? "Running Workflow..." : "Run Full Workflow"}
                </button>
              </div>

              <div className="intake-info">
                <div>
                  <span>Latest upload</span>
                  <strong>{boqUpload.filename ?? "No file uploaded"}</strong>
                  <span>{boqUpload.status}</span>
                </div>
                <div>
                  <span>Detected sheet</span>
                  <strong>{boqUpload.detected_sheet ?? "Waiting for workflow run"}</strong>
                  <span>{boqUpload.uploaded_at ?? "No upload timestamp yet"}</span>
                </div>
                <div>
                  <span>Workflow mode</span>
                  <strong>{workflow.mode}</strong>
                  <span>Last run: {workflow.last_run ?? "Not run yet"}</span>
                </div>
                <div>
                  <span>Planner export</span>
                  <strong>{planner.export_file}</strong>
                  <span>Updated: {planner.export_updated_at ?? "Not generated yet"}</span>
                </div>
              </div>
            </div>
          </section>

          <div className="section-head">
            <div>
              <p className="eyebrow">Specialist agents</p>
              <h2>All specialist packages now feed one shared workflow run</h2>
              <p className="section-copy">
                These cards are now status and output previews. They update after the parallel workflow finishes rather
                than waiting for manual per-agent runs.
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
                  <span>{agent.boq_matches} BOQ matches</span>
                  <span>{agent.latest_output.length} output activities</span>
                  <span>{agent.last_run ?? "Not run yet"}</span>
                </div>
                <div className="sample-list">
                  <div className="sample-list-head">
                    <span>Activity preview</span>
                  </div>
                  {agent.latest_output.slice(0, 3).map((item) => (
                    <div key={item["Activity Name"]}>
                      <strong>{item["Activity Name"]}</strong>
                      <span>{item.WBS}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="right-column">
          <section className="panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Project manager</p>
                <h2>{planner.name}</h2>
                <p className="section-copy">
                  This agent now sits at the end of the shared workflow, consuming all package outputs and formatting the
                  final workbook for Primavera import.
                </p>
              </div>
              <span className="planner-badge">TASK / TASKPRED / USERDATA</span>
            </div>
            <p className="agent-name">{planner.role}</p>
            <p className="planner-goal">{planner.goal}</p>
            <div className="flow-list">
              {planner.flow.map((step) => (
                <span key={step}>{step}</span>
              ))}
            </div>
            <div className="planner-actions">
              <a className="run-button export-link" href={getApiUrl("/api/exports/primavera.xlsx")} target="_blank" rel="noreferrer">
                Download Primavera Import XLSX
              </a>
              <p className="planner-export-note">
                The export follows the sheet naming and column pattern from your attached Primavera sample workbook.
              </p>
              <div className="planner-meta">
                <span>Status</span>
                <strong>{planner.status}</strong>
                <span>Last run</span>
                <strong>{planner.last_run ?? "Not run yet"}</strong>
                <span>Export updated</span>
                <strong>{planner.export_updated_at ?? "Not generated yet"}</strong>
                <span>BOQ sheet</span>
                <strong>{boqUpload.detected_sheet ?? "Unknown"}</strong>
              </div>
            </div>
          </section>

          <section className="panel timeline-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Concurrent schedule</p>
                <h2>Upcoming activity view</h2>
                <p className="section-copy">
                  The project manager now builds package schedules from a shared mobilization point and rolls them into a
                  single finish date for export.
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
          </section>

          <section className="panel chat-panel">
            <div className="panel-head">
              <div>
                <p className="eyebrow">Project assistant</p>
                <h2>Plain-language support</h2>
                <p className="section-copy">
                  You can still ask about an agent, describe a delay, or review the current finish date in plain language.
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
                placeholder="Try: We lost 2 days because ceiling access was blocked."
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
