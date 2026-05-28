const fs = require('fs');
const styles = `
/* New UI Elements for V1.1 */
.prm-picking-overlay {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    background-color: var(--background-primary);
    border: 1px solid var(--interactive-accent);
    padding: 8px 16px;
    border-radius: 8px;
    z-index: 9999;
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    font-size: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
}
.prm-picking-overlay button {
    background: transparent;
    border: 1px solid var(--background-modifier-border);
    cursor: pointer;
    padding: 2px 8px;
    border-radius: 4px;
}
.prm-picking-overlay button:hover {
    background: var(--background-modifier-hover);
}
.prm-card-actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
    border-top: 1px dashed var(--background-modifier-border);
    padding-top: 6px;
}
.prm-action-btn {
    flex: 1;
    background: var(--background-secondary);
    border: 1px solid var(--background-modifier-border);
    color: var(--text-muted);
    font-size: 11px;
    padding: 4px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;
}
.prm-action-btn:hover {
    color: var(--text-normal);
    border-color: var(--interactive-accent);
}
.prm-tag-precise {
    background-color: rgba(47, 158, 68, 0.1);
    color: #2f9e44;
    border-color: rgba(47, 158, 68, 0.3);
}

/* Domain Colors for Map Markers */
.prm-marker-default {
    background-color: var(--interactive-accent) !important;
    box-shadow: 0 0 8px var(--interactive-accent) !important;
}
.prm-marker-green {
    background-color: #40c057 !important;
    box-shadow: 0 0 8px #40c057 !important;
}
.prm-marker-gold {
    background-color: #fab005 !important;
    box-shadow: 0 0 8px #fab005 !important;
}
.prm-marker-purple {
    background-color: #be4bdb !important;
    box-shadow: 0 0 8px #be4bdb !important;
}
.prm-marker-blue {
    background-color: #228be6 !important;
    box-shadow: 0 0 8px #228be6 !important;
}
.prm-marker-precise {
    border: 2px solid #000 !important;
}
.theme-dark .prm-marker-precise {
    border: 2px solid #fff !important;
}
`;
fs.appendFileSync('styles.css', styles);
