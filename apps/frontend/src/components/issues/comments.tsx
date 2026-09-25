'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/feedback';
import { api, apiPage, errorMessage } from '@/lib/api';
import { useCurrentUser } from '@/lib/auth';
import { timeAgo } from '@/lib/format';
import { qk } from '@/lib/query-keys';
import type { Comment, IssueDetail } from '@/lib/types';

/** Renders plain text with @mentions highlighted. React escapes everything else. */
function CommentBody({ text }: { text: string }) {
  const parts = text.split(/(@[a-zA-Z0-9_-]{3,30})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-ink-2">
      {parts.map((part, i) =>
        part.startsWith('@') ? <span key={i} className="rounded bg-accent-soft px-0.5 font-medium text-accent-strong">{part}</span> : part,
      )}
    </p>
  );
}

function CommentItem({ comment, issue }: { comment: Comment; issue: IssueDetail }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const [confirming, setConfirming] = useState(false);
  const mine = comment.authorId === me.id;
  // Managers can moderate: the delete button follows the same rule as the API.
  const canDelete = mine || issue.permissions.canDelete;
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: qk.comments(issue.id) });
    queryClient.invalidateQueries({ queryKey: qk.issue(issue.id) });
  };

  const save = useMutation({
    mutationFn: () => api<Comment>(`/comments/${comment.id}`, { method: 'PATCH', body: { body: draft } }),
    onSuccess: () => {
      setEditing(false);
      refresh();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const remove = useMutation({
    mutationFn: () => api(`/comments/${comment.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      setConfirming(false);
      refresh();
      toast.success('Comment deleted');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  const edited = new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() > 1000;

  return (
    <li className="flex gap-3">
      <Avatar user={comment.author} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{comment.author.name}</span>
          <time dateTime={comment.createdAt} className="text-xs text-muted" title={new Date(comment.createdAt).toLocaleString()}>
            {timeAgo(comment.createdAt)}
          </time>
          {edited && <span className="text-xs text-muted">(edited)</span>}
        </div>
        {editing ? (
          <div className="mt-1.5">
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={5000} aria-label="Edit comment" autoFocus />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => save.mutate()} loading={save.isPending} disabled={!draft.trim()}>Save</Button>
              <Button size="sm" onClick={() => { setEditing(false); setDraft(comment.body); }}>Cancel</Button>
            </div>
          </div>
        ) : (
          <div className="mt-0.5"><CommentBody text={comment.body} /></div>
        )}
        {!editing && (mine || canDelete) && (
          <div className="mt-1 flex gap-3 text-xs">
            {mine && <button onClick={() => setEditing(true)} className="text-muted hover:text-ink">Edit</button>}
            {canDelete && <button onClick={() => setConfirming(true)} className="text-muted hover:text-danger">Delete</button>}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        loading={remove.isPending}
        title="Delete this comment?"
        description="The comment is removed for everyone. This cannot be undone."
        confirmLabel="Delete comment"
      />
    </li>
  );
}

export function Comments({ issue }: { issue: IssueDetail }) {
  const me = useCurrentUser();
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const comments = useQuery({
    queryKey: qk.comments(issue.id),
    queryFn: () => apiPage<Comment>(`/issues/${issue.id}/comments`, { limit: 100 }),
  });

  const post = useMutation({
    mutationFn: () => api<Comment>(`/issues/${issue.id}/comments`, { method: 'POST', body: { body } }),
    onSuccess: () => {
      setBody('');
      queryClient.invalidateQueries({ queryKey: qk.comments(issue.id) });
      queryClient.invalidateQueries({ queryKey: qk.activity(issue.id) });
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <div>
      {comments.isPending ? (
        <Skeleton className="h-20" />
      ) : comments.isError ? (
        <p className="text-danger">{errorMessage(comments.error)}</p>
      ) : comments.data.data.length === 0 ? (
        <p className="text-muted">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-5">
          {comments.data.data.map((c) => <CommentItem key={c.id} comment={c} issue={issue} />)}
        </ul>
      )}

      {issue.permissions.canComment ? (
        <form
          className="mt-6 flex gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) post.mutate();
          }}
        >
          <Avatar user={me} className="mt-0.5" />
          <div className="flex-1">
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body.trim()) post.mutate();
              }}
              placeholder="Add a comment. Use @username to notify a teammate."
              rows={3}
              maxLength={5000}
              aria-label="New comment"
            />
            <div className="mt-2 flex items-center justify-between">
              <span className="hidden text-xs text-muted sm:inline">Ctrl + Enter to send</span>
              <Button type="submit" variant="primary" size="sm" loading={post.isPending} disabled={!body.trim()}>Comment</Button>
            </div>
          </div>
        </form>
      ) : (
        <p className="mt-6 rounded-md bg-sunken px-3 py-2 text-xs text-muted">Your role can read comments but not post them.</p>
      )}
    </div>
  );
}
