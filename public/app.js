let parsedJson = {};
let mappings = [];
const segmentFieldCache = new Map();
let currentSegment = null;
let allSegments = [];
let currentFields = [];
const dragState = { active: false, clientX: 0, clientY: 0, raf: null };

/* -------------------------
   LOAD & PARSE JSON
-------------------------- */
function loadJson() {
    mappings = [];
    const input = document.getElementById("jsonInput").value.trim();
    const jsonFields = document.getElementById("jsonFields");
    const jsonHeader = document.getElementById("jsonHeader");
    jsonFields.innerHTML = "";
    if (jsonHeader) {
        jsonHeader.classList.remove("hidden");
    }
    jsonFields.classList.remove("hidden");
    if (!input) {
        jsonFields.innerHTML = "<li class=\"segment-error\">Paste JSON to load fields.</li>";
        return;
    }
    try {
        parsedJson = JSON.parse(input);
    } catch (err) {
        jsonFields.innerHTML = "<li class=\"segment-error\">Invalid JSON. Please fix and try again.</li>";
        return;
    }
    const outputPanel = document.getElementById("outputPanel");
    if (outputPanel) {
        outputPanel.classList.add("hidden");
    }
    extractFields(parsedJson, "");
}

/* -------------------------
   EXTRACT JSON FIELDS
-------------------------- */
function addJsonField(path) {
    const li = document.createElement("li");
    li.textContent = path;
    li.dataset.jsonPath = path;
    li.draggable = true;

    li.addEventListener("dragstart", e => {
        e.dataTransfer.setData("text/plain", path);
        e.dataTransfer.effectAllowed = "copy";
        dragState.active = true;
        dragState.clientX = e.clientX;
        dragState.clientY = e.clientY;
        startAutoScroll();
    });

    li.addEventListener("dragend", () => {
        dragState.active = false;
    });

    document.getElementById("jsonFields").appendChild(li);
}

function extractFields(obj, prefix) {
    if (Array.isArray(obj)) {
        obj.forEach((value, index) => {
            const path = prefix ? `${prefix}.${index}` : String(index);
            if (value !== null && typeof value === "object") {
                extractFields(value, path);
            } else {
                addJsonField(path);
            }
        });
        return;
    }

    if (obj !== null && typeof obj === "object") {
        for (let key in obj) {
            const path = prefix ? `${prefix}.${key}` : key;
            if (obj[key] !== null && typeof obj[key] === "object") {
                extractFields(obj[key], path);
            } else {
                addJsonField(path);
            }
        }
        return;
    }

    if (prefix) {
        addJsonField(prefix);
    }
}

/* -------------------------
   RENDER HL7 FIELDS
-------------------------- */
async function loadSegments(version) {
    const res = await fetch(`/hl7-segments?version=${encodeURIComponent(version)}`);
    const data = await res.json();
    if (!res.ok) {
        throw new Error(
            `${data.error || "Failed to load segments."} (HTTP ${res.status})`
        );
    }
    return data.segments || [];
}

async function loadSegmentFields(version, segmentId) {
    const key = `${version}:${segmentId}`;
    if (segmentFieldCache.has(key)) {
        return segmentFieldCache.get(key);
    }

    const res = await fetch(
        `/hl7-segment-details?version=${encodeURIComponent(version)}&segment=${encodeURIComponent(segmentId)}`
    );
    const data = await res.json();
    if (!res.ok) {
        throw new Error(data.error || "Failed to load segment details.");
    }

    const fields = data.fields || [];
    segmentFieldCache.set(key, fields);
    return fields;
}

function renderFieldList(segmentId, fields) {
    const fieldContainer = document.getElementById("hl7Fields");
    const fieldCount = document.getElementById("fieldCount");
    const query = document.getElementById("fieldSearch").value.trim().toLowerCase();
    const filtered = query
        ? fields.filter(f =>
            `${segmentId}-${f.field} ${f.name}`.toLowerCase().includes(query)
        )
        : fields;

    fieldContainer.innerHTML = "";
    fieldCount.textContent = query
        ? `${filtered.length} / ${fields.length}`
        : `${fields.length}`;

    if (!filtered.length) {
        fieldContainer.innerHTML = "<li class=\"segment-error\">No fields found.</li>";
        return;
    }

    filtered.forEach(f => {
        const li = document.createElement("li");
        const label = `${segmentId}-${f.field} ${f.name}`;
        li.className = "hl7";
        li.dataset.segment = segmentId;
        li.dataset.field = f.field;
        li.dataset.label = label;
        li.textContent = label;

        const existing = mappings.find(m =>
            m.segment === segmentId && m.field === Number(f.field) && m.component === null
        );
        if (existing) {
            const mappedValue = existing.jsonPath || existing.literalValue || existing.rawValue;
            li.textContent = `${label} -> ${mappedValue}`;
            li.classList.add("mapped");
            li.dataset.jsonPath = existing.jsonPath || "";
            ensureRevertButton(li);
        }

        makeDroppable(li);
        fieldContainer.appendChild(li);
    });
}

function updateFieldList() {
    if (!currentSegment) {
        return;
    }
    renderFieldList(currentSegment, currentFields);
}

function renderSegmentList(version) {
    const segmentContainer = document.getElementById("hl7Segments");
    const segmentCount = document.getElementById("segmentCount");
    const query = document.getElementById("segmentSearch").value.trim().toLowerCase();
    const filtered = query
        ? allSegments.filter(seg =>
            `${seg.segment} ${seg.title}`.toLowerCase().includes(query)
        )
        : allSegments;

    segmentContainer.innerHTML = "";
    segmentCount.textContent = query
        ? `${filtered.length} / ${allSegments.length}`
        : `${allSegments.length}`;

    if (!filtered.length) {
        segmentContainer.innerHTML = "<li class=\"segment-error\">No segments found.</li>";
        return;
    }

    filtered.forEach(segment => {
        const li = document.createElement("li");
        li.className = "segment-item";
        li.dataset.segment = segment.segment;
        li.textContent = `${segment.segment} - ${segment.title}`;
        li.addEventListener("click", () => {
            selectSegment(version, segment.segment);
        });
        segmentContainer.appendChild(li);
    });

    if (!query && currentSegment && !filtered.some(seg => seg.segment === currentSegment)) {
        currentSegment = null;
    }
}

async function selectSegment(version, segmentId) {
    currentSegment = segmentId;
    const segmentItems = document.querySelectorAll(".segment-item");
    segmentItems.forEach(item => {
        item.classList.toggle("active", item.dataset.segment === segmentId);
    });

    const segmentBox = document.querySelector('.hl7-box[data-box="segments"]');
    if (segmentBox) {
        segmentBox.classList.add("collapsed");
    }
    const fieldBox = document.querySelector('.hl7-box[data-box="fields"]');
    if (fieldBox) {
        fieldBox.classList.remove("collapsed");
    }

    const fieldContainer = document.getElementById("hl7Fields");
    fieldContainer.innerHTML = "<li class=\"field-loading\">Loading fields...</li>";
    document.getElementById("fieldCount").textContent = "0";

    try {
        const fields = await loadSegmentFields(version, segmentId);
        currentFields = fields;
        renderFieldList(segmentId, fields);
    } catch (err) {
        console.error(err);
        fieldContainer.innerHTML = `<li class="segment-error">${err.message}</li>`;
    }
}

async function renderHL7Fields() {
    const segmentContainer = document.getElementById("hl7Segments");
    const fieldContainer = document.getElementById("hl7Fields");
    const fieldCount = document.getElementById("fieldCount");
    const version = document.getElementById("hl7Version").value;

    segmentContainer.innerHTML = "<li class=\"segment-loading\">Loading segments...</li>";
    fieldContainer.innerHTML = "<li class=\"field-loading\">Select a segment.</li>";
    fieldCount.textContent = "0";

    let segments = [];
    try {
        segments = await loadSegments(version);
    } catch (err) {
        console.error(err);
        segmentContainer.innerHTML = `<li class="segment-error">${err.message}</li>`;
        return;
    }

    allSegments = segments;
    renderSegmentList(version);
}

/* -------------------------
   MAKE HL7 FIELD DROPPABLE
-------------------------- */
function makeDroppable(li) {

    li.addEventListener("dragover", e => {
        e.preventDefault();
        li.classList.add("dragover");
    });

    li.addEventListener("dragleave", () => {
        li.classList.remove("dragover");
    });

    li.addEventListener("drop", e => {
        e.preventDefault();
        li.classList.remove("dragover");

        const rawValue = e.dataTransfer.getData("text/plain");
        if (!rawValue) {
            return;
        }
        const trimmedValue = rawValue.trim();
        const isPath = /^[A-Za-z0-9_.\s-]+$/.test(trimmedValue);
        let jsonPath = isPath ? trimmedValue : null;
        let literalValue = isPath ? null : extractLiteral(trimmedValue);
        if (jsonPath) {
            const resolved = getValueFromPath(parsedJson, jsonPath);
            if (resolved === undefined || resolved === null) {
                jsonPath = null;
                literalValue = extractLiteral(trimmedValue);
            }
        }
        if (!jsonPath && (literalValue === null || literalValue === "")) {
            return;
        }
        const segment = li.dataset.segment;
        const field = Number(li.dataset.field);
        const component = li.dataset.component
            ? Number(li.dataset.component)
            : null;

        const previousJsonPath = li.dataset.jsonPath || null;

        // Prevent duplicate mapping on same HL7 field/component
        mappings = mappings.filter(m =>
            !(m.segment === segment && m.field === field && m.component === component)
        );

        mappings.push({ jsonPath, literalValue, rawValue: trimmedValue, segment, field, component });

        li.textContent = `${li.dataset.label} -> ${jsonPath || literalValue || trimmedValue}`;
        li.classList.add("mapped");
        li.dataset.jsonPath = jsonPath || "";

        ensureRevertButton(li);

        if (previousJsonPath && previousJsonPath !== jsonPath) {
            updateJsonMappedState(previousJsonPath);
        }
        if (jsonPath) {
            updateJsonMappedState(jsonPath);
        }
    });
}

function extractLiteral(text) {
    if (!text) {
        return "";
    }
    let candidate = text;
    if (candidate.includes(":")) {
        candidate = candidate.split(":").slice(1).join(":").trim();
    }
    if (candidate.endsWith(",")) {
        candidate = candidate.slice(0, -1).trim();
    }
    try {
        return JSON.parse(candidate);
    } catch (err) {
        return candidate.replace(/^\"|\"$/g, "");
    }
}

function getValueFromPath(obj, path) {
    if (!obj || !path) {
        return null;
    }
    return path.split(".").reduce((o, p) => (o ? o[p] : null), obj);
}

function ensureRevertButton(li) {
    if (li.querySelector(".map-clear")) {
        return;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "map-clear";
    btn.textContent = "×";
    btn.addEventListener("click", e => {
        e.stopPropagation();
        clearMapping(li);
    });
    li.appendChild(btn);
}

function clearMapping(li) {
    const jsonPath = li.dataset.jsonPath;
    const segment = li.dataset.segment;
    const field = Number(li.dataset.field);
    const component = li.dataset.component ? Number(li.dataset.component) : null;

    mappings = mappings.filter(m =>
        !(m.segment === segment && m.field === field && m.component === component)
    );

    li.textContent = li.dataset.label;
    li.classList.remove("mapped");
    delete li.dataset.jsonPath;

    const btn = li.querySelector(".map-clear");
    if (btn) {
        btn.remove();
    }

    if (jsonPath) {
        updateJsonMappedState(jsonPath);
    }
}

function updateJsonMappedState(jsonPath) {
    const jsonItems = document.querySelectorAll(
        `#jsonFields li[data-json-path="${jsonPath}"]`
    );
    const isMapped = mappings.some(m => m.jsonPath === jsonPath);
    jsonItems.forEach(item => {
        item.classList.toggle("json-mapped", isMapped);
    });
}

function startAutoScroll() {
    if (dragState.raf) {
        return;
    }
    const scrollTargets = [
        document.getElementById("hl7Fields"),
        document.getElementById("hl7Segments"),
        document.getElementById("jsonFields")
    ].filter(Boolean);
    const edge = 80;

    const step = () => {
        if (!dragState.active) {
            dragState.raf = null;
            return;
        }

        const { clientX, clientY } = dragState;
        const height = window.innerHeight;
        let dy = 0;

        if (clientY < edge) {
            dy = -Math.ceil((edge - clientY) / 8) * 6;
        } else if (clientY > height - edge) {
            dy = Math.ceil((clientY - (height - edge)) / 8) * 6;
        }

        if (dy !== 0) {
            window.scrollBy(0, dy);
        }

        const hovered = document.elementFromPoint(clientX, clientY);
        if (hovered) {
            const target = scrollTargets.find(el => el.contains(hovered));
            if (target) {
                const rect = target.getBoundingClientRect();
                if (clientY < rect.top + edge) {
                    target.scrollTop -= Math.abs(dy || 6);
                } else if (clientY > rect.bottom - edge) {
                    target.scrollTop += Math.abs(dy || 6);
                }
            }
        }

        dragState.raf = requestAnimationFrame(step);
    };

    dragState.raf = requestAnimationFrame(step);
}

/* -------------------------
   GENERATE HL7
-------------------------- */
function generateHL7() {
    fetch("/generate-hl7", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            inputJson: parsedJson,
            mappings,
            version: document.getElementById("hl7Version").value
        })
    })
    .then(async res => {
        const data = await res.json();
        if (!res.ok) {
            throw new Error(data.error || "Failed to generate HL7.");
        }
        return data;
    })
    .then(data => {
        document.getElementById("output").textContent = data.hl7;
        const outputPanel = document.getElementById("outputPanel");
        if (outputPanel) {
            outputPanel.classList.remove("hidden");
        }
        const fieldBox = document.querySelector('.hl7-box[data-box="fields"]');
        if (fieldBox) {
            fieldBox.classList.add("collapsed");
        }
    })
    .catch(err => {
        console.error(err);
        const outputPanel = document.getElementById("outputPanel");
        if (outputPanel) {
            outputPanel.classList.remove("hidden");
        }
        document.getElementById("output").textContent = `Error: ${err.message}`;
    });
}

/* -------------------------
   INITIALIZE HL7 UI
-------------------------- */
document.addEventListener("DOMContentLoaded", () => {
    document.addEventListener("dragover", e => {
        dragState.clientX = e.clientX;
        dragState.clientY = e.clientY;
    });
    renderHL7Fields();
    const jsonInput = document.getElementById("jsonInput");
    if (jsonInput) {
        jsonInput.setAttribute("draggable", "true");
        jsonInput.addEventListener("dragstart", e => {
            const selection = jsonInput.value.substring(
                jsonInput.selectionStart,
                jsonInput.selectionEnd
            );
            if (!selection) {
                e.preventDefault();
                return;
            }
            e.dataTransfer.setData("text/plain", selection);
            e.dataTransfer.effectAllowed = "copy";
        });
    }
    const closeJsonFields = document.getElementById("closeJsonFields");
    if (closeJsonFields) {
        closeJsonFields.addEventListener("click", () => {
            const jsonFields = document.getElementById("jsonFields");
            const jsonHeader = document.getElementById("jsonHeader");
            if (jsonFields) {
                jsonFields.innerHTML = "";
                jsonFields.classList.add("hidden");
            }
            if (jsonHeader) {
                jsonHeader.classList.add("hidden");
            }
        });
    }
    const closeOutput = document.getElementById("closeOutput");
    if (closeOutput) {
        closeOutput.addEventListener("click", () => {
            const outputPanel = document.getElementById("outputPanel");
            if (outputPanel) {
                outputPanel.classList.add("hidden");
            }
        });
    }
    const versionSelect = document.getElementById("hl7Version");
    versionSelect.addEventListener("change", () => {
        mappings = [];
        segmentFieldCache.clear();
        currentSegment = null;
        currentFields = [];
        allSegments = [];
        document.getElementById("output").textContent = "";
        const outputPanel = document.getElementById("outputPanel");
        if (outputPanel) {
            outputPanel.classList.add("hidden");
        }
        renderHL7Fields();
    });

    document.querySelectorAll(".hl7-box .box-header").forEach(header => {
        header.addEventListener("click", () => {
            const box = header.closest(".hl7-box");
            if (!box) return;

            if (box.dataset.box === "segments") {
                box.classList.remove("collapsed");
            } else {
                box.classList.toggle("collapsed");
            }
        });
    });

    document.querySelectorAll(".box-close").forEach(btn => {
        btn.addEventListener("click", e => {
            e.stopPropagation();
            const boxName = btn.dataset.close;
            const box = document.querySelector(`.hl7-box[data-box="${boxName}"]`);
            if (box) {
                box.classList.add("collapsed");
            }
        });
    });

    document.getElementById("segmentSearch").addEventListener("input", () => {
        const version = document.getElementById("hl7Version").value;
        renderSegmentList(version);
    });

    document.getElementById("fieldSearch").addEventListener("input", () => {
        updateFieldList();
    });
});
