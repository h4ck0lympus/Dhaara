"""Small, disclosed rules for explicit task capture. Not a language model.

No windows/projects lookup, inferred dependencies, estimates, reminders or jobs.
Unsupported/uncertain wording stays in the immutable original, not new facts.
"""
import re
from datetime import date, timedelta

from .models import TaskCreate


def interpret(raw: str, local_day: date):
    lines = [line.strip() for line in raw.splitlines() if line.strip()]
    title = re.sub(r'\s+', ' ', lines[0])
    if len(title) > 240: title = title[:237] + '...'
    fields = {'title': title, 'project': 'Unassigned', 'detail': raw}
    labels = {'next action': 'next_action', 'context': 'detail', 'workflow': 'project'}
    for label, field in labels.items():
        match = re.search(rf'^{label}:\s*(.+)$', raw, re.I | re.M)
        limit = {'next_action': 1000, 'detail': 16000, 'project': 80}[field]
        if match and len(match[1].strip()) <= limit:
            fields[field] = match[1].strip()

    scheduling = re.search(r'\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b', raw, re.I)
    uncertain = re.search(r'\b(maybe|perhaps|possibly|probably|might|could|not sure|unconfirmed|if)\b', raw, re.I)
    consequential = re.search(r'\b(deadline|due|by|before|after|until|remind|reminder|available|not before)\b', raw, re.I)
    explanation = ''
    if scheduling and not uncertain and not consequential:
        matches = re.findall(r'\b(today|tomorrow|\d{4}-\d{2}-\d{2})\b', raw, re.I)
        if len(matches) == 1:
            value = matches[0].lower()
            try:
                day = local_day + timedelta(days=1) if value == 'tomorrow' else local_day if value == 'today' else date.fromisoformat(value)
                relative_plan = value in ('today', 'tomorrow') and (
                    re.search(r'^(today|tomorrow)(?:[,:]|\s)', lines[0], re.I) or
                    re.search(r'\b(today|tomorrow)[.!?]*$', lines[0], re.I) or
                    re.search(r'^(plan|planned)(?: for)?\s*:\s*(today|tomorrow)\s*$', raw, re.I | re.M)
                ) and not re.search(r'\b(from|since|about)\s+(today|tomorrow)\b', raw, re.I)
                absolute_plan = value not in ('today', 'tomorrow') and re.search(r'\b(on|plan(?:ned)?(?: for)?)\s*:?\s*' + re.escape(value), raw, re.I)
                if relative_plan or absolute_plan:
                    fields['planned_on'] = day
                    explanation = f'Planned for {day.isoformat()} from your wording; no deadline, reminder or availability restriction added.'
            except (ValueError, OverflowError):
                pass
    if not explanation and re.search(r'\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week|\d{4}-\d{2}-\d{2}|remind|deadline|due)\b', raw, re.I):
        explanation = 'Scheduling wording kept in the original. No date, deadline, reminder or availability restriction was added; correct it in Edit if needed.'
    return TaskCreate(**fields).model_dump(mode='json'), {
        'method': 'limited-rules', 'explanation': explanation,
        'workflow': 'explicit label' if fields['project'] != 'Unassigned' else 'unknown',
    }
