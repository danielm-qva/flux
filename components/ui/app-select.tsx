"use client";

import { Select } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  Fragment,
  isValidElement,
  useMemo,
  type ReactNode,
  type ComponentProps,
} from "react";
import { cn } from "@/lib/utils";

type Option = {
  value: string;
  label: ReactNode;
  text: string;
  disabled: boolean;
  group?: string;
};
type OptionProps = {
  value?: string | number;
  label?: string;
  disabled?: boolean;
  children?: ReactNode;
};
type Props = Omit<
  ComponentProps<"button">,
  "value" | "defaultValue" | "onChange" | "children"
> & {
  value?: string | number;
  defaultValue?: string | number;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  name?: string;
  required?: boolean;
};

function plainText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? plainText(child.props.children)
        : String(child ?? ""),
    )
    .join("");
}

// Options are declarative data; no native select or option is rendered.
function readOptions(
  children: ReactNode,
  group?: string,
  disabled = false,
): Option[] {
  const result: Option[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionProps>(child)) return;
    if (child.type === "option") {
      const text = child.props.label ?? plainText(child.props.children);
      result.push({
        value: String(child.props.value ?? text),
        label: child.props.children,
        text,
        disabled: disabled || !!child.props.disabled,
        group,
      });
    } else if (child.type === "optgroup") {
      result.push(
        ...readOptions(
          child.props.children,
          child.props.label,
          disabled || !!child.props.disabled,
        ),
      );
    } else if (child.type === Fragment) {
      result.push(...readOptions(child.props.children, group, disabled));
    }
  });
  return result;
}

export function AppSelect({
  children,
  value,
  defaultValue,
  onValueChange,
  name,
  required,
  disabled,
  id,
  form,
  className,
  ...triggerProps
}: Props) {
  const options = useMemo(() => readOptions(children), [children]);
  const groups = Array.from(new Set(options.map((option) => option.group)));
  function renderOption(option: Option) {
    return (
      <Select.Item
        key={option.value}
        value={option.value}
        label={option.text}
        disabled={option.disabled}
        className="fx-select-option"
        data-method={
          /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(option.value)
            ? option.value.toLowerCase()
            : undefined
        }
      >
        <Select.ItemText className="fx-select-option-text">
          {option.label}
        </Select.ItemText>
        <Select.ItemIndicator className="fx-select-check">
          <Check size={14} />
        </Select.ItemIndicator>
      </Select.Item>
    );
  }
  return (
    <Select.Root<string>
      value={value === undefined ? undefined : String(value)}
      defaultValue={
        defaultValue === undefined ? undefined : String(defaultValue)
      }
      onValueChange={(next) => {
        if (next !== null) onValueChange?.(next);
      }}
      items={options.map((option) => ({
        value: option.value,
        label: option.text,
      }))}
      name={name}
      required={required}
      disabled={disabled}
      id={id}
      form={form}
    >
      <Select.Trigger
        {...triggerProps}
        type="button"
        className={cn(
          "fx-select-trigger inline-flex h-9 min-w-0 items-center gap-2 rounded-[10px] bg-[var(--flux-well)] px-3 text-left text-xs text-foreground",
          className,
        )}
      >
        <Select.Value className="fx-select-value" />
        <Select.Icon className="fx-select-caret">
          <ChevronDown size={13} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Positioner
          align="start"
          sideOffset={6}
          alignItemWithTrigger={false}
          className="fx-select-positioner"
        >
          <Select.Popup className="fx-select-popup">
            <Select.List className="fx-select-list">
              {groups.map((group) =>
                group === undefined ? (
                  <Fragment key="ungrouped">
                    {options
                      .filter((option) => option.group === undefined)
                      .map(renderOption)}
                  </Fragment>
                ) : (
                  <Select.Group key={group}>
                    <Select.GroupLabel className="fx-select-group-label">
                      {group}
                    </Select.GroupLabel>
                    {options
                      .filter((option) => option.group === group)
                      .map(renderOption)}
                  </Select.Group>
                ),
              )}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
