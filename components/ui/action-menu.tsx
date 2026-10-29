"use client";

import { Menu } from "@base-ui/react/menu";
import { MoreVertical, type LucideIcon } from "lucide-react";

type Action = {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
};

export function ActionMenu({
  label,
  actions,
}: {
  label: string;
  actions: Action[];
}) {
  return (
    <Menu.Root>
      <Menu.Trigger
        type="button"
        aria-label={label}
        title={label}
        className="fx-action-trigger"
      >
        <MoreVertical size={14} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          className="fx-action-positioner"
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={8}
        >
          <Menu.Popup className="fx-action-menu" aria-label={label}>
            {actions.map(
              ({ label: text, icon: Icon, onClick, destructive }) => (
                <Menu.Item
                  key={text}
                  onClick={onClick}
                  className={`fx-action-item ${destructive ? "is-destructive" : ""}`}
                >
                  <Icon size={15} />
                  <span>{text}</span>
                </Menu.Item>
              ),
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
