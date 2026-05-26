import React from "react";
import { TransferState } from "@arc/cctp-sdk";

export type TransferStatusBadgeProps = {
  state: TransferState;
  className?: string;
  showIcon?: boolean;
  pulse?: boolean;
};

const stateConfigs: Record<
  TransferState,
  { label: string; bg: string; text: string; border: string; glow: string; dot: string }
> = {
  [TransferState.IDLE]: {
    label: "Idle",
    bg: "rgba(100, 116, 139, 0.1)",
    text: "#94a3b8",
    border: "rgba(148, 163, 184, 0.2)",
    glow: "rgba(148, 163, 184, 0)",
    dot: "#94a3b8",
  },
  [TransferState.APPROVING]: {
    label: "Approving USDC",
    bg: "rgba(245, 158, 11, 0.1)",
    text: "#fbbf24",
    border: "rgba(245, 158, 11, 0.2)",
    glow: "rgba(245, 158, 11, 0.15)",
    dot: "#f59e0b",
  },
  [TransferState.APPROVED]: {
    label: "USDC Approved",
    bg: "rgba(16, 185, 129, 0.1)",
    text: "#34d399",
    border: "rgba(16, 185, 129, 0.2)",
    glow: "rgba(16, 185, 129, 0.15)",
    dot: "#10b981",
  },
  [TransferState.BURNING]: {
    label: "Initiating Burn",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.2)",
    glow: "rgba(59, 130, 246, 0.15)",
    dot: "#3b82f6",
  },
  [TransferState.BURNED]: {
    label: "USDC Burned",
    bg: "rgba(99, 102, 241, 0.1)",
    text: "#818cf8",
    border: "rgba(99, 102, 241, 0.2)",
    glow: "rgba(99, 102, 241, 0.15)",
    dot: "#6366f1",
  },
  [TransferState.AWAITING_ATTESTATION]: {
    label: "Awaiting Circle Attestation",
    bg: "rgba(139, 92, 246, 0.1)",
    text: "#a78bfa",
    border: "rgba(139, 92, 246, 0.2)",
    glow: "rgba(139, 92, 246, 0.15)",
    dot: "#8b5cf6",
  },
  [TransferState.ATTESTED]: {
    label: "Attestation Ready",
    bg: "rgba(16, 185, 129, 0.15)",
    text: "#34d399",
    border: "rgba(16, 185, 129, 0.3)",
    glow: "rgba(16, 185, 129, 0.25)",
    dot: "#10b981",
  },
  [TransferState.RELAYING]: {
    label: "Relaying on Destination",
    bg: "rgba(236, 72, 153, 0.1)",
    text: "#f472b6",
    border: "rgba(236, 72, 153, 0.2)",
    glow: "rgba(236, 72, 153, 0.15)",
    dot: "#ec4899",
  },
  [TransferState.COMPLETE]: {
    label: "Completed Successfully",
    bg: "rgba(16, 185, 129, 0.2)",
    text: "#10b981",
    border: "rgba(16, 185, 129, 0.4)",
    glow: "rgba(16, 185, 129, 0.35)",
    dot: "#10b981",
  },
  [TransferState.FAILED]: {
    label: "Transfer Failed",
    bg: "rgba(239, 68, 68, 0.15)",
    text: "#f87171",
    border: "rgba(239, 68, 68, 0.3)",
    glow: "rgba(239, 68, 68, 0.25)",
    dot: "#ef4848",
  },
};

export const TransferStatusBadge: React.FC<TransferStatusBadgeProps> = ({
  state,
  className = "",
  showIcon = true,
  pulse = true,
}) => {
  const config = stateConfigs[state];

  // Inline styling for premium styling compatibility without tailwind
  const badgeStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "6px 14px",
    borderRadius: "9999px",
    backgroundColor: config.bg,
    color: config.text,
    border: `1px solid ${config.border}`,
    boxShadow: `0 0 12px ${config.glow}`,
    fontSize: "0.875rem",
    fontWeight: 600,
    fontFamily: "'Outfit', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
    letterSpacing: "0.025em",
  };

  const isPulsing = pulse && ![TransferState.IDLE, TransferState.COMPLETE, TransferState.FAILED].includes(state);

  return (
    <div style={badgeStyle} className={className}>
      {showIcon && (
        <span
          style={{
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            backgroundColor: config.dot,
            boxShadow: `0 0 8px ${config.dot}`,
            display: "inline-block",
            animation: isPulsing ? "arc-badge-pulse 1.8s infinite ease-in-out" : "none",
          }}
        />
      )}
      <span>{config.label}</span>
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes arc-badge-pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
            box-shadow: 0 0 8px currentColor;
          }
          50% {
            transform: scale(1.35);
            opacity: 0.55;
            box-shadow: 0 0 16px currentColor;
          }
        }
      `}} />
    </div>
  );
};
