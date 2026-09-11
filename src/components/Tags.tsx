import type { Project } from '../lib/types';
import { dueClass, fmtDue } from '../lib/util';

export const ProjTag = ({ p }: { p: Project | undefined }) => p ? <span className={`tag ${p.type}`}>{p.name}</span> : null;
export const DueTag = ({ due }: { due: string | null | undefined }) => due ? <span className={`tag due ${dueClass(due)}`}>{fmtDue(due)}</span> : null;
export const PriTag = ({ priority }: { priority: string }) => priority === 'high' ? <span className="tag pri">P0</span> : null;
export const WhoTag = ({ name }: { name: string }) => name ? <span className="tag who">{name}</span> : null;
