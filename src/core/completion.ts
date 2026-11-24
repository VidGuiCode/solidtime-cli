import type { Command } from "commander";

export type Shell = "bash" | "zsh" | "fish" | "powershell";

export const SUPPORTED_SHELLS: readonly Shell[] = ["bash", "zsh", "fish", "powershell"];

export interface CompletionOption {
  long: string;
  description: string;
}

export interface CompletionCommandNode {
  name: string;
  aliases: string[];
  description: string;
  options: CompletionOption[];
  subcommands: CompletionCommandNode[];
}

export function isSupportedShell(value: string): value is Shell {
  return SUPPORTED_SHELLS.includes(value as Shell);
}

function cleanDesc(text: string): string {
  return text.replace(/[\r\n\t]+/g, " ").trim();
}

function extractOptions(cmd: Command): CompletionOption[] {
  const seen = new Set<string>();
  const opts: CompletionOption[] = [];

  for (const opt of cmd.options) {
    if (opt.hidden || !opt.long || seen.has(opt.long)) continue;
    seen.add(opt.long);
    opts.push({ long: opt.long, description: cleanDesc(opt.description ?? "") });
  }

  if (!seen.has("--help")) {
    opts.push({ long: "--help", description: "Display help for command" });
  }

  return opts;
}

/**
 * Recursively walk a Commander command tree into a static data structure for
 * shell completion generators.
 */
export function collectCommandTree(cmd: Command): CompletionCommandNode {
  const subcommands = cmd.commands
    .filter((sub) => !(sub as unknown as { _hidden?: boolean })._hidden)
    .map((sub) => collectCommandTree(sub));

  return {
    name: cmd.name(),
    aliases: cmd.aliases(),
    description: cleanDesc(cmd.description() ?? ""),
    options: extractOptions(cmd),
    subcommands,
  };
}

function allNames(node: CompletionCommandNode): string[] {
  return [node.name, ...node.aliases];
}

function escapeZshSpec(text: string): string {
  return text.replace(/'/g, "'\\''");
}

function escapeFishQuoted(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\$/g, "\\$");
}

function escapePwshSingle(text: string): string {
  return text.replace(/'/g, "''");
}

function safeFnSuffix(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

function mergeOptionNames(node: CompletionCommandNode, globalOpts: CompletionOption[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const o of [...node.options, ...globalOpts]) {
    if (!seen.has(o.long)) {
      seen.add(o.long);
      names.push(o.long);
    }
  }
  return names;
}

function mergeOptions(
  node: CompletionCommandNode,
  globalOpts: CompletionOption[],
): CompletionOption[] {
  const seen = new Set<string>();
  const opts: CompletionOption[] = [];
  for (const o of [...node.options, ...globalOpts]) {
    if (!seen.has(o.long)) {
      seen.add(o.long);
      opts.push(o);
    }
  }
  return opts;
}

function generateBashCompletion(tree: CompletionCommandNode): string {
  const prog = tree.name;
  const globalOptNames = tree.options.map((o) => o.long);
  const topNames = tree.subcommands.flatMap((c) => allNames(c)).join(" ");

  const subcommandCases: string[] = [];
  const optionCases: string[] = [];

  for (const cmd of tree.subcommands) {
    const pattern = allNames(cmd).join("|");
    if (cmd.subcommands.length > 0) {
      const subNames = cmd.subcommands.flatMap((s) => allNames(s)).join(" ");
      subcommandCases.push(
        `            ${pattern})\n` +
          `                COMPREPLY=( $(compgen -W "${subNames}" -- "$cur") )\n` +
          `                return 0\n` +
          `                ;;`,
      );
      for (const sub of cmd.subcommands) {
        const subNames = allNames(sub);
        const keyPattern = allNames(cmd)
          .flatMap((cName) => subNames.map((sName) => `${cName}:${sName}`))
          .join("|");
        const opts = mergeOptionNames(sub, tree.options).join(" ");
        optionCases.push(
          `            ${keyPattern})\n` +
            `                COMPREPLY=( $(compgen -W "${opts}" -- "$cur") )\n` +
            `                return 0\n` +
            `                ;;`,
        );
      }
    } else if (cmd.name === "completion") {
      subcommandCases.push(
        `            ${pattern})\n` +
          `                COMPREPLY=( $(compgen -W "${SUPPORTED_SHELLS.join(" ")}" -- "$cur") )\n` +
          `                return 0\n` +
          `                ;;`,
      );
    }

    const parentKeyPattern = allNames(cmd)
      .map((cName) => `${cName}:`)
      .join("|");
    const parentOpts = mergeOptionNames(cmd, tree.options).join(" ");
    optionCases.push(
      `            ${parentKeyPattern})\n` +
        `                COMPREPLY=( $(compgen -W "${parentOpts}" -- "$cur") )\n` +
        `                return 0\n` +
        `                ;;`,
    );
  }

  return `_${safeFnSuffix(prog)}_completion() {
    local cur
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"

    local cmd=""
    local subcmd=""
    local i=1
    while [[ $i -lt $COMP_CWORD ]]; do
        local word="\${COMP_WORDS[$i]}"
        if [[ "$word" == -* ]]; then
            i=$((i + 1))
            continue
        fi
        if [[ -z "$cmd" ]]; then
            cmd="$word"
        elif [[ -z "$subcmd" ]]; then
            subcmd="$word"
        fi
        i=$((i + 1))
    done

    if [[ "$cur" == -* ]]; then
        case "$cmd:$subcmd" in
${optionCases.join("\n")}
            *)
                COMPREPLY=( $(compgen -W "${globalOptNames.join(" ")}" -- "$cur") )
                return 0
                ;;
        esac
    fi

    if [[ -z "$cmd" ]]; then
        COMPREPLY=( $(compgen -W "${topNames}" -- "$cur") )
        return 0
    fi

    if [[ -z "$subcmd" ]]; then
        case "$cmd" in
${subcommandCases.join("\n")}
        esac
    fi

    case "$cmd:$subcmd" in
${optionCases.join("\n")}
    esac
}

complete -F _${safeFnSuffix(prog)}_completion ${prog}
`;
}

function zshArgLine(opt: CompletionOption): string {
  const desc = escapeZshSpec(opt.description || opt.long);
  return `'${opt.long}[${desc}]'`;
}

function generateZshCompletion(tree: CompletionCommandNode): string {
  const prog = tree.name;
  const fnPrefix = `_${safeFnSuffix(prog)}`;
  const rootArgLines = tree.options.map(zshArgLine).join(" \\\n        ");

  const topDescribeItems: string[] = [];
  const helperFns: string[] = [];
  const topDispatch: string[] = [];

  for (const cmd of tree.subcommands) {
    const fnName = `${fnPrefix}_${safeFnSuffix(cmd.name)}`;
    const pattern = allNames(cmd).join("|");
    for (const aliasOrName of allNames(cmd)) {
      const desc = escapeZshSpec(cmd.description || cmd.name);
      topDescribeItems.push(`'${aliasOrName}:${desc}'`);
    }
    topDispatch.push(`                ${pattern}) ${fnName} ;;`);

    if (cmd.subcommands.length > 0) {
      const subItems: string[] = [];
      const subDispatch: string[] = [];
      for (const sub of cmd.subcommands) {
        const subPattern = allNames(sub).join("|");
        for (const sName of allNames(sub)) {
          const desc = escapeZshSpec(sub.description || sub.name);
          subItems.push(`'${sName}:${desc}'`);
        }
        const subArgLines = mergeOptions(sub, tree.options)
          .map(zshArgLine)
          .join(" \\\n                        ");
        subDispatch.push(
          `                ${subPattern})\n` +
            `                    _arguments -s \\\n` +
            `                        ${subArgLines}\n` +
            `                    ;;`,
        );
      }

      const cmdOpts = mergeOptions(cmd, tree.options).map(zshArgLine).join(" \\\n        ");
      helperFns.push(`${fnName}() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        ${cmdOpts} \\
        '1: :->subcommand' \\
        '*:: :->args'

    case "$state" in
        subcommand)
            local -a subcommands
            subcommands=(
                ${subItems.join("\n                ")}
            )
            _describe -t subcommands '${cmd.name} subcommand' subcommands
            ;;
        args)
            case "$line[1]" in
${subDispatch.join("\n")}
            esac
            ;;
    esac
}`);
    } else if (cmd.name === "completion") {
      const cmdOpts = mergeOptions(cmd, tree.options).map(zshArgLine).join(" \\\n        ");
      helperFns.push(`${fnName}() {
    _arguments -s \\
        ${cmdOpts} \\
        '1:shell:(${SUPPORTED_SHELLS.join(" ")})'
}`);
    } else {
      const cmdOpts = mergeOptions(cmd, tree.options).map(zshArgLine).join(" \\\n        ");
      helperFns.push(`${fnName}() {
    _arguments -s \\
        ${cmdOpts}
}`);
    }
  }

  return `#compdef ${prog}

${helperFns.join("\n\n")}

${fnPrefix}() {
    local curcontext="$curcontext" state line
    typeset -A opt_args

    _arguments -C \\
        ${rootArgLines} \\
        '1: :->command' \\
        '*:: :->args'

    case "$state" in
        command)
            local -a commands
            commands=(
                ${topDescribeItems.join("\n                ")}
            )
            _describe -t commands '${prog} command' commands
            ;;
        args)
            case "$line[1]" in
${topDispatch.join("\n")}
            esac
            ;;
    esac
}

${fnPrefix} "$@"
`;
}

function generateFishCompletion(tree: CompletionCommandNode): string {
  const prog = tree.name;
  const lines: string[] = [`complete -c ${prog} -f`, ""];

  // Root global options when no subcommand yet (or everywhere in Fish unless scoped)
  for (const opt of tree.options) {
    const longName = opt.long.replace(/^--/, "");
    const desc = escapeFishQuoted(opt.description || opt.long);
    lines.push(`complete -c ${prog} -l "${longName}" -d "${desc}"`);
  }
  lines.push("");

  for (const cmd of tree.subcommands) {
    const cmdNames = allNames(cmd);
    const cmdSeen = `__fish_seen_subcommand_from ${cmdNames.join(" ")}`;
    const cmdDesc = escapeFishQuoted(cmd.description || cmd.name);

    for (const nameOrAlias of cmdNames) {
      lines.push(
        `complete -c ${prog} -n "__fish_use_subcommand" -a "${nameOrAlias}" -d "${cmdDesc}"`,
      );
    }

    if (cmd.subcommands.length > 0) {
      const allSubNames = cmd.subcommands.flatMap((s) => allNames(s));
      const notYetSub = `not __fish_seen_subcommand_from ${allSubNames.join(" ")}`;

      for (const opt of cmd.options) {
        const longName = opt.long.replace(/^--/, "");
        const desc = escapeFishQuoted(opt.description || opt.long);
        lines.push(
          `complete -c ${prog} -n "${cmdSeen}; and ${notYetSub}" -l "${longName}" -d "${desc}"`,
        );
      }

      for (const sub of cmd.subcommands) {
        const subNames = allNames(sub);
        const subSeen = `${cmdSeen}; and __fish_seen_subcommand_from ${subNames.join(" ")}`;
        const subDesc = escapeFishQuoted(sub.description || sub.name);
        for (const sName of subNames) {
          lines.push(
            `complete -c ${prog} -n "${cmdSeen}; and ${notYetSub}" -a "${sName}" -d "${subDesc}"`,
          );
        }
        for (const opt of sub.options) {
          const longName = opt.long.replace(/^--/, "");
          const desc = escapeFishQuoted(opt.description || opt.long);
          lines.push(`complete -c ${prog} -n "${subSeen}" -l "${longName}" -d "${desc}"`);
        }
      }
    } else {
      if (cmd.name === "completion") {
        lines.push(
          `complete -c ${prog} -n "${cmdSeen}; and not __fish_seen_subcommand_from ${SUPPORTED_SHELLS.join(" ")}" -a "${SUPPORTED_SHELLS.join(" ")}" -d "Shell type"`,
        );
      }
      for (const opt of cmd.options) {
        const longName = opt.long.replace(/^--/, "");
        const desc = escapeFishQuoted(opt.description || opt.long);
        lines.push(`complete -c ${prog} -n "${cmdSeen}" -l "${longName}" -d "${desc}"`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").trimEnd() + "\n";
}

function pwshEntryArray(items: Array<{ name: string; description: string }>): string {
  if (items.length === 0) return "@()";
  const entries = items.map(
    (item) =>
      `@{ Name = '${escapePwshSingle(item.name)}'; Description = '${escapePwshSingle(item.description || item.name)}' }`,
  );
  return `@(\n            ${entries.join("\n            ")}\n        )`;
}

function generatePowerShellCompletion(tree: CompletionCommandNode): string {
  const prog = tree.name;

  const globalItems = tree.options.map((o) => ({ name: o.long, description: o.description }));
  const topItems = tree.subcommands.flatMap((cmd) =>
    allNames(cmd).map((name) => ({ name, description: cmd.description || cmd.name })),
  );

  const aliasPairs: string[] = [];
  const subcommandBlocks: string[] = [];
  const optionBlocks: string[] = [];

  for (const cmd of tree.subcommands) {
    for (const alias of cmd.aliases) {
      aliasPairs.push(`'${escapePwshSingle(alias)}' = '${escapePwshSingle(cmd.name)}'`);
    }

    if (cmd.subcommands.length > 0) {
      const subItems = cmd.subcommands.flatMap((sub) =>
        allNames(sub).map((name) => ({ name, description: sub.description || sub.name })),
      );
      subcommandBlocks.push(
        `        '${escapePwshSingle(cmd.name)}' = ${pwshEntryArray(subItems)}`,
      );
      for (const sub of cmd.subcommands) {
        const opts = mergeOptions(sub, tree.options).map((o) => ({
          name: o.long,
          description: o.description,
        }));
        optionBlocks.push(
          `        '${escapePwshSingle(`${cmd.name}:${sub.name}`)}' = ${pwshEntryArray(opts)}`,
        );
      }
    } else if (cmd.name === "completion") {
      const shellItems = SUPPORTED_SHELLS.map((s) => ({
        name: s,
        description: `Generate ${s} completions`,
      }));
      subcommandBlocks.push(
        `        '${escapePwshSingle(cmd.name)}' = ${pwshEntryArray(shellItems)}`,
      );
    }

    const cmdOpts = mergeOptions(cmd, tree.options).map((o) => ({
      name: o.long,
      description: o.description,
    }));
    optionBlocks.push(`        '${escapePwshSingle(cmd.name)}' = ${pwshEntryArray(cmdOpts)}`);
  }

  return `Register-ArgumentCompleter -Native -CommandName '${escapePwshSingle(prog)}' -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $globalOptions = ${pwshEntryArray(globalItems)}

    $topCommands = ${pwshEntryArray(topItems)}

    $aliases = @{
        ${aliasPairs.join("\n        ")}
    }

    $subcommands = @{
${subcommandBlocks.join("\n")}
    }

    $options = @{
${optionBlocks.join("\n")}
    }

    $elements = $commandAst.CommandElements
    $limit = if ([string]::IsNullOrEmpty($wordToComplete)) { $elements.Count } else { $elements.Count - 1 }
    $positionals = @()
    for ($i = 1; $i -lt $limit; $i++) {
        $text = $elements[$i].Extent.Text
        if ($text.StartsWith('-')) { continue }
        $positionals += $text
    }

    $cmd = if ($positionals.Count -ge 1) {
        $raw = $positionals[0]
        if ($aliases.ContainsKey($raw)) { $aliases[$raw] } else { $raw }
    } else { $null }
    $sub = if ($positionals.Count -ge 2) { $positionals[1] } else { $null }

    $candidates = @()
    if ($wordToComplete.StartsWith('-')) {
        if ($cmd -and $sub -and $options.ContainsKey("$($cmd):$sub")) {
            $candidates = $options["$($cmd):$sub"]
        } elseif ($cmd -and $options.ContainsKey($cmd)) {
            $candidates = $options[$cmd]
        } else {
            $candidates = $globalOptions
        }
    } elseif (-not $cmd) {
        $candidates = $topCommands
    } elseif (-not $sub) {
        if ($subcommands.ContainsKey($cmd)) {
            $candidates = $subcommands[$cmd]
        } elseif ($options.ContainsKey($cmd)) {
            $candidates = $options[$cmd]
        }
    } else {
        if ($options.ContainsKey("$($cmd):$sub")) {
            $candidates = $options["$($cmd):$sub"]
        } elseif ($options.ContainsKey($cmd)) {
            $candidates = $options[$cmd]
        }
    }

    foreach ($item in $candidates) {
        if ($item.Name -like "$wordToComplete*") {
            $desc = if ([string]::IsNullOrWhiteSpace($item.Description)) { $item.Name } else { $item.Description }
            [System.Management.Automation.CompletionResult]::new($item.Name, $item.Name, 'ParameterValue', $desc)
        }
    }
}
`;
}

export function generateCompletionScript(program: Command, shell: Shell): string {
  const tree = collectCommandTree(program);
  switch (shell) {
    case "bash":
      return generateBashCompletion(tree);
    case "zsh":
      return generateZshCompletion(tree);
    case "fish":
      return generateFishCompletion(tree);
    case "powershell":
      return generatePowerShellCompletion(tree);
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}
