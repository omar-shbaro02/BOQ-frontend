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

function isSupportedBoqFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return [".xlsx", ".xls", ".pdf"].some((suffix) => name.endsWith(suffix));
}

function App() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const [schemaCheck, setSchemaCheck] = useState({
    status: "checking",
    message: "Checking agent schemas...",
    count: 0,
    models: [],
  });
  const [workflowProgress, setWorkflowProgress] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const fileInputRef = useRef(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadDashboard();
    loadAgentSchemas();
  }, []);

  useEffect(() => {
    if (!dashboard || workflowBusy) return;
    setWorkflowProgress(buildWorkflowSteps(dashboard, schemaCheck));
  }, [dashboard, schemaCheck, workflowBusy]);

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

  function isMissingEndpoint(error) {
    const message = String(error?.message || "");
    return message.toLowerCase().includes("not found") || message.includes("404");
  }

  function readSchemaSummary(data) {
    const runtime = data?.runtime || {};
    const schemaAgents = Array.isArray(data)
      ? data
      : data.agents ||
        data.schemas ||
        [
          data.specialist_agent_output ? { name: "specialist_agent_output", model: runtime.model, provider: "openai" } : null,
          data.project_manager_agent_output ? { name: "project_manager_agent_output", model: runtime.model, provider: "openai" } : null,
        ].filter(Boolean);
    const count = Array.isArray(schemaAgents) ? schemaAgents.length : 0;
    const modelNames = schemaAgents
      .map((agent) => agent.model || agent.openai_model || agent.model_name)
      .filter(Boolean);
    const uniqueModels = [...new Set(modelNames)];
    const openAiMarked =
      runtime.enabled === true ||
      runtime.package_available === true ||
      data.openai_agents === true ||
      data.provider === "openai" ||
      schemaAgents.some((agent) => String(agent.provider || agent.type || "").toLowerCase().includes("openai")) ||
      uniqueModels.some((model) => /^gpt-|^o\d/i.test(model));

    return {
      count,
      models: uniqueModels,
      openAiMarked,
      runtime,
    };
  }

  function buildWorkflowSteps(currentDashboard, schemaState = schemaCheck) {
    if (!currentDashboard) return [];
    const orderedAgents = [...currentDashboard.agents].sort((a, b) => a.sequence - b.sequence);
    return [
      {
        id: "schemas",
        label: "Verify OpenAI model setup",
        status: schemaState.status,
        note: schemaState.message,
      },
      ...orderedAgents.map((agent) => ({
        id: agent.id,
        label: `${agent.sequence}. ${agent.wbs_category}`,
        status: agent.status || "waiting",
        note: agent.last_run ? `Last run ${agent.last_run}` : agent.agent_name,
      })),
      {
        id: currentDashboard.planner.id,
        label: currentDashboard.planner.name,
        status: currentDashboard.planner.status || "waiting",
        note: currentDashboard.planner.last_run ? `Last run ${currentDashboard.planner.last_run}` : "Build schedule and export",
      },
    ];
  }

  function updateWorkflowStep(stepId, status, note = "") {
    setWorkflowProgress((steps) => steps.map((step) => (step.id === stepId ? { ...step, status, note } : step)));
  }

  async function loadAgentSchemas() {
    const initial = { status: "checking", message: "Checking agent schemas...", count: 0, models: [] };
    setSchemaCheck(initial);

    try {
      const data = await requestJson("/api/agents/schemas");
      const summary = readSchemaSummary(data);
      const runtimeMessage = summary.runtime.enabled
        ? `OpenAI model schemas verified. Live model: ${summary.runtime.model}.`
        : summary.runtime.package_available
          ? `OpenAI package detected, but the backend is missing ${summary.runtime.missing?.join(", ") || "required runtime settings"}.`
          : "OpenAI runtime is not installed on the backend.";
      const next = {
        status: summary.runtime.enabled ? "verified" : summary.openAiMarked ? "fallback" : "error",
        message: runtimeMessage,
        count: summary.count,
        models: summary.models,
      };
      setSchemaCheck(next);
      return next;
    } catch (error) {
      if (isMissingEndpoint(error)) {
        const next = {
          status: "fallback",
          message: "Schema endpoint is unavailable on this backend; workflow can still run.",
          count: 0,
          models: [],
        };
        setSchemaCheck(next);
        return next;
      }

      const next = {
        status: "error",
        message: error.message,
        count: 0,
        models: [],
      };
      setSchemaCheck(next);
      return next;
    }
  }

  async function loadDashboard() {
    setLoading(true);
    setErrorMessage("");
    try {
      const data = await requestJson("/api/dashboard");
      setDashboard(data);
      setWorkflowProgress(buildWorkflowSteps(data, schemaCheck));
    } catch (error) {
      setDashboard(null);
      setErrorMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function uploadBoq() {
    if (!selectedFile) return;
    if (!isSupportedBoqFile(selectedFile)) {
      setErrorMessage("Upload a BOQ file in .xlsx, .xls, or .pdf format.");
      return;
    }

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
      setWorkflowProgress(buildWorkflowSteps(data, schemaCheck));
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
    if (!dashboard) return;

    setWorkflowBusy(true);
    setErrorMessage("");

    const schemaState = await loadAgentSchemas();
    setWorkflowProgress(buildWorkflowSteps(dashboard, schemaState));

    try {
      updateWorkflowStep("schemas", schemaState.status === "error" ? "failed" : schemaState.status, schemaState.message);
      const data = await requestJson("/api/workflow/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      setDashboard(data);
      setWorkflowProgress(buildWorkflowSteps(data, schemaState));
    } catch (error) {
      setErrorMessage(error.message);
      setWorkflowProgress((steps) =>
        steps.map((step) =>
          step.status === "running" || step.status === "queued" || step.status === "waiting"
            ? { ...step, status: "failed", note: error.message }
            : step,
        ),
      );
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

  const orderedAgents = [...agents].sort((a, b) => a.sequence - b.sequence);
  const upcomingActivities = timeline.schedule.slice(0, 8);
  const readyToRun = Boolean(boqUpload.stored_path) && !workflowBusy;
  const stepsToRender = workflowProgress.length ? workflowProgress : buildWorkflowSteps(dashboard, schemaCheck);

  return (
    <main className="page-shell">
      {errorMessage ? <div className="loading-shell">{errorMessage}</div> : null}

      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Construction AI workflow</p>
          <h1>Upload the BOQ once, launch all specialists together, and export Primavera-ready logic.</h1>
          <p className="hero-copy">
            The specialist agents now run as one coordinated workflow. After upload, one run starts all package
            extractors, then the project manager compiles their outputs into the Primavera import format.
          </p>
          <div className="hero-notes">
            <span>OpenAI-backed agents</span>
            <span>Structured JSON extraction</span>
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
            <p>Store the workbook and prepare the backend parser.</p>
          </div>
        </article>
        <article className="workflow-card">
          <span className="workflow-step">02</span>
          <div>
            <strong>Run workflow</strong>
            <p>Launch all specialist agents through the backend workflow endpoint.</p>
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
                  Upload the BOQ file, then trigger the backend workflow that runs the specialists and lets the project manager
                  generate the final Primavera import workbook.
                </p>
              </div>
              <span className={`status-pill ${workflow.status}`}>{workflow.status}</span>
            </div>

            <div className="intake-shell">
              <div className="intake-dropzone">
                <strong>{selectedFile ? selectedFile.name : "Choose BOQ file"}</strong>
                <span>{selectedFile ? "Ready to upload" : "Select a BOQ in Excel or PDF format to drive the workflow"}</span>
                <input
                  ref={fileInputRef}
                  className="file-input"
                  type="file"
                  accept=".xlsx,.xls,.pdf,application/pdf"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    setSelectedFile(file);
                    setErrorMessage(file && !isSupportedBoqFile(file) ? "Upload a BOQ file in .xlsx, .xls, or .pdf format." : "");
                  }}
                />
                <button className="run-button" type="button" onClick={uploadBoq} disabled={!selectedFile || uploadBusy || !isSupportedBoqFile(selectedFile)}>
                  {uploadBusy ? "Uploading..." : "Upload BOQ File"}
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
              <h2>WBS package outputs</h2>
              <p className="section-copy">
                These cards show each agent's current output preview, backend status, and most recent run details.
              </p>
            </div>
          </div>

          <div className="agent-grid">
            {orderedAgents.map((agent) => (
              <article className="agent-card" key={agent.id}>
                <div className="agent-card-top">
                  <span className="agent-seq">Agent {agent.sequence}</span>
                  <span className={`status-pill ${agent.status}`}>{agent.status}</span>
                </div>
                <h3>{agent.wbs_category}</h3>
                <p className="agent-name">{agent.agent_name}</p>
                <p className="agent-task">{agent.task}</p>
                <div className="agent-guidelines">
                  <span>{agent.boq_matches ?? 0} BOQ matches</span>
                  <span>{agent.latest_output.length} output activities</span>
                  <span>{agent.last_run_source ?? "Waiting for run"}</span>
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
                <div className="agent-run-meta">
                  <span>Last run</span>
                  <strong>{agent.last_run ?? "Waiting for full workflow"}</strong>
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
                  The project manager consolidates all package outputs and formats the final workbook for Primavera import.
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
                <span>Run source</span>
                <strong>{planner.last_run_source ?? "Unknown"}</strong>
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
                  This is the current schedule snapshot that will be exported to Primavera.
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
