"""Parse Supabase linter CSV for multiple_permissive_policies and output consolidation summary."""
import csv
import re
from collections import defaultdict

csv_path = r"c:\Users\eneal\Downloads\Supabase Performance Security Lints (default) (5).csv"
data = defaultdict(lambda: defaultdict(set))  # table -> action -> set of policy names

with open(csv_path, "r", encoding="utf-8") as f:
    reader = csv.DictReader(f)
    for row in reader:
        if row.get("name") != "multiple_permissive_policies":
            continue
        detail = row.get("detail", "")
        table_match = re.search(r"Table `public\.([^`]+)`", detail)
        action_match = re.search(r"for action `([^`]+)`", detail)
        policies_match = re.search(r"Policies include `(\{[^`]*\})`", detail)

        if table_match and action_match and policies_match:
            table = table_match.group(1)
            action = action_match.group(1)
            policies_str = policies_match.group(1)
            policies_str = policies_str.strip("{}")
            # Parse: quoted strings or unquoted identifiers separated by comma
            policies = []
            in_quote = False
            current = []
            i = 0
            while i < len(policies_str):
                c = policies_str[i]
                if c == '"':
                    in_quote = not in_quote
                elif c == "," and not in_quote:
                    p = "".join(current).strip().strip('"')
                    if p:
                        policies.append(p)
                    current = []
                else:
                    current.append(c)
                i += 1
            p = "".join(current).strip().strip('"')
            if p:
                policies.append(p)
            data[table][action].update(policies)

# Output summary
print("SUMMARY: Multiple Permissive Policies - Policies to consolidate per (table, action)\n")
for table in sorted(data.keys()):
    actions = data[table]
    parts = []
    for action in sorted(actions.keys()):
        policies = sorted(actions[action])
        parts.append(f"  {action} -> {policies}")
    print(f"- {table}:")
    for p in parts:
        print(p)
    print()
