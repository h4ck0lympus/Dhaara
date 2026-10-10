import { z } from 'zod';
export const DEMO_CLOCK = { instant: '2026-10-09T15:00:00-07:00', timezone: 'America/Phoenix' } as const;
export const InterpretationSchema = z.object({ kind: z.enum(['fixture', 'unavailable']), title: z.string().max(4000), deadline: z.literal('Tonight').optional(), provenance: z.string().max(400) }).strict();
export type Interpretation = z.infer<typeof InterpretationSchema>;
export interface TaskInterpreter { interpret(raw: string, clock: typeof DEMO_CLOCK): Promise<Interpretation> }
export const fixtureInterpreter: TaskInterpreter = { async interpret(raw) {
  return raw.trim().toLowerCase() === 'leetcode by tonight'
    ? { kind: 'fixture', title: 'Practice LeetCode', deadline: 'Tonight', provenance: 'Explicit example fixture · automatic priority from demo rules' }
    : { kind: 'unavailable', title: raw.trim().split('\n')[0].slice(0, 160), provenance: 'Interpretation unavailable · original wording saved · automatic demo priority' };
} };
const Attachment = z.object({ id: z.string().max(80), name: z.string().max(200), data: z.string().max(2_800_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/) }).strict();
const Activity = z.object({ app:z.string().max(160), title:z.string().max(1000), monitor:z.string().max(80), workspace:z.string().max(80), observedAt:z.string().max(40), seconds:z.number().int().min(0).max(10_000_000) }).strict();
export const CompanionStateSchema=z.object({connected:z.boolean(),observing:z.boolean(),mode:z.enum(['Cat','Dot','Hidden']),provider:z.string().max(80),status:z.string().max(200),context:z.object({app:z.string().max(160),title:z.string().max(1000),workspace:z.string().max(80),monitor:z.string().max(80),bounds:z.object({x:z.number(),y:z.number(),width:z.number(),height:z.number()}).optional()}).nullable(),taskId:z.string().max(80).nullable(),activity:z.record(z.string(),Activity)}).strict();
export type CompanionState=z.infer<typeof CompanionStateSchema>;
const Task = z.object({ id: z.string().max(80), title: z.string().min(1).max(4000), raw: z.string().max(4000), priority: z.enum(['Automatic', 'High', 'Normal', 'Low']), status: z.enum(['ready', 'waiting', 'review', 'complete']), action: z.string().max(4000), interpretation: InterpretationSchema.optional(), activityMatch:z.string().max(160).optional(), activity:Activity.optional() }).strict();
const Note = z.object({ id: z.string().max(80), title: z.string().max(160), folder: z.string().max(100), raw: z.string().max(20000), organized: z.string().max(20000), example: z.boolean(), images: z.array(Attachment).max(4) }).strict();
export const DemoSchema = z.object({ version: z.literal(1), tasks: z.array(Task).max(200), notes: z.array(Note).max(100), pin: z.string().nullable(), draft: z.object({ id: z.string().max(80), raw: z.string().max(4000) }).strict(), capture: z.object({ id: z.string().max(80), raw: z.string().max(20000), images: z.array(Attachment).max(4) }).strict(), cat: z.enum(['Cat', 'Dot', 'Hidden']) }).strict().refine(d => new Set(d.tasks.map(t=>t.id)).size === d.tasks.length && new Set(d.notes.map(n=>n.id)).size === d.notes.length, 'Duplicate record identity');
export type Demo = z.infer<typeof DemoSchema>;
export type DemoTask = z.infer<typeof Task>;
export type DemoNote = z.infer<typeof Note>;
export type DemoAttachment = z.infer<typeof Attachment>;
export type Fixture = 'populated' | 'empty' | 'waiting' | 'review' | 'offline';
export const noteExample = `An allocator owns a region of memory. Allocation returns a view into that region; releasing it must happen only after the last reference is done.\n\nHypothesis: a borrowed view can outlive the cleanup path. Run a small synthetic example and record whether the hypothesis holds.\n\nKeep ownership and lifetime separate. A failed hypothesis is still useful evidence.`;
export function fixture(kind: Fixture = 'populated'): Demo {
  const tasks: DemoTask[] = kind === 'empty' ? [] : [
    { id:'allocator', title:'Inspect the allocator example', raw:'Inspect the allocator example', priority:'Automatic', status:kind === 'waiting' ? 'waiting' : kind === 'review' ? 'review' : 'ready', action:'Run the synthetic example and record whether the hypothesis holds.' },
    { id:'summary', title:'Summarize the result', raw:'Summarize the result after the example finishes', priority:'Automatic', status:'waiting', action:'Waiting for the allocator example.' },
    { id:'draft', title:'Review the research draft', raw:'Review the research draft', priority:'High',status:'ready',action:'Read the draft and note the next revision.',activityMatch:'research draft' },
    { id:'alerts', title:'Triage job alerts', raw:'Triage job alerts', priority:'Normal',status:'ready',action:'Review the saved alerts.',activityMatch:'job alerts' },
    { id:'practice', title:'Continue LeetCode', raw:'Continue LeetCode', priority:'Low',status:'ready',action:'Return to the current practice session.',activityMatch:'leetcode' }
  ];
  return { version:1, tasks, notes: kind === 'empty' ? [] : [{ id:'memory', title:'Memory, ownership & the cleanup path', folder:'Learning', raw:'allocator owns memory. borrowed view might survive cleanup? try a small example. keep lifetime separate from ownership.', organized:noteExample, example:true, images:[] }], pin:tasks[0]?.id ?? null, draft:{id:'',raw:''}, capture:{id:'',raw:'',images:[]},cat:'Cat' };
}
