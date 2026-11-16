'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api/client';
import type { ContactImport, ContactList } from '@/lib/api/types';

const FIELDS = [
  { value: 'skip', label: "Don't import" },
  { value: 'email', label: 'Email' },
  { value: 'firstName', label: 'First name' },
  { value: 'lastName', label: 'Last name' },
  { value: 'phone', label: 'Phone' },
  { value: 'tags', label: 'Tags' },
];

/** Guess a field from a CSV header so most files map themselves. */
const guess = (header: string) => {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  if (h.includes('email')) return 'email';
  if (['firstname', 'first', 'fname', 'givenname'].includes(h)) return 'firstName';
  if (['lastname', 'last', 'lname', 'surname', 'familyname'].includes(h)) return 'lastName';
  if (h.includes('phone') || h.includes('mobile')) return 'phone';
  if (h.includes('tag')) return 'tags';
  return `attr:${header.trim()}`;
};

export function ImportDialog({ lists }: { lists: ContactList[] }) {
  const ref = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; sample: string[][] } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [listId, setListId] = useState<string>('none');
  const [consent, setConsent] = useState(false);
  const [importId, setImportId] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setConsent(false);
    setImportId(null);
  };

  const previewMut = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.set('file', f);
      return api<{ headers: string[]; sample: string[][] }>('/contacts/import/preview', {
        method: 'POST',
        body: form,
      });
    },
    onSuccess: (p) => {
      setPreview(p);
      setMapping(Object.fromEntries(p.headers.map((h) => [h, guess(h)])));
    },
  });

  const start = useMutation({
    mutationFn: () => {
      const form = new FormData();
      form.set('file', file!);
      const cleaned = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v !== 'skip'));
      form.set(
        'options',
        JSON.stringify({
          mapping: cleaned,
          listId: listId === 'none' ? undefined : listId,
          tags: [],
          consentConfirmed: consent,
        }),
      );
      return api<ContactImport>('/contacts/import', { method: 'POST', body: form });
    },
    onSuccess: (r) => setImportId(r.id),
  });

  const progress = useQuery({
    queryKey: ['contact-import', importId],
    queryFn: () => api<ContactImport>(`/contacts/import/${importId}`),
    enabled: Boolean(importId),
    refetchInterval: (q) =>
      ['COMPLETED', 'FAILED'].includes(q.state.data?.status ?? '') ? false : 1500,
  });
  const finished = progress.data && ['COMPLETED', 'FAILED'].includes(progress.data.status);
  useEffect(() => {
    if (!finished) return;
    qc.invalidateQueries({ queryKey: ['contacts'] });
    qc.invalidateQueries({ queryKey: ['contact-lists'] });
  }, [finished, qc]);

  const hasEmail = Object.values(mapping).includes('email');

  return (
    <Dialog open={open} onOpenChange={(o) => (setOpen(o), !o && reset())}>
      <DialogTrigger asChild>
        <Button>
          <FileUp className="size-4" /> Import CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV from any tool (Shopify, Mailchimp, a spreadsheet). Existing contacts are
            updated, not duplicated.
          </DialogDescription>
        </DialogHeader>

        {importId ? (
          <div className="space-y-4 py-4">
            {finished ? (
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="size-5 text-emerald-500" /> Import{' '}
                {progress.data!.status.toLowerCase()}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Loader2 className="size-4 animate-spin" /> Importing…
              </div>
            )}
            <Progress value={finished ? 100 : progress.data?.totalRows ? 50 : 10} />
            {progress.data && (
              <p className="text-muted-foreground text-sm">
                {progress.data.imported.toLocaleString()} new ·{' '}
                {progress.data.updated.toLocaleString()} updated ·{' '}
                {progress.data.skipped.toLocaleString()} skipped of{' '}
                {progress.data.totalRows.toLocaleString()} rows
              </p>
            )}
            {progress.data?.errors.slice(0, 5).map((e, i) => (
              <p key={i} className="text-destructive text-xs">
                Row {e.row}: {e.message}
              </p>
            ))}
          </div>
        ) : !preview ? (
          <button
            type="button"
            onClick={() => ref.current?.click()}
            className="hover:bg-muted/50 flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm"
          >
            {previewMut.isPending ? (
              <Loader2 className="size-6 animate-spin" />
            ) : (
              <FileUp className="text-muted-foreground size-6" />
            )}
            Click to choose a .csv file
            <input
              ref={ref}
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  previewMut.mutate(f);
                }
              }}
            />
          </button>
        ) : (
          <div className="space-y-4">
            <div className="max-h-64 overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Column</TableHead>
                    <TableHead>Example</TableHead>
                    <TableHead>Import as</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.headers.map((h, i) => (
                    <TableRow key={h}>
                      <TableCell className="font-medium">{h}</TableCell>
                      <TableCell className="text-muted-foreground max-w-40 truncate">
                        {preview.sample[0]?.[i]}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[h]}
                          onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v }))}
                        >
                          <SelectTrigger className="w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELDS.map((f) => (
                              <SelectItem key={f.value} value={f.value}>
                                {f.label}
                              </SelectItem>
                            ))}
                            <SelectItem value={`attr:${h.trim()}`}>
                              Custom field “{h.trim()}”
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Field>
              <FieldLabel>Add to list</FieldLabel>
              <Select value={listId} onValueChange={setListId}>
                <SelectTrigger className="w-60">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No list</SelectItem>
                  {lists.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Label className="flex items-start gap-2 font-normal">
              <Checkbox
                checked={consent}
                onCheckedChange={(v) => setConsent(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">
                I confirm these people agreed to receive marketing email from me. (Required by
                anti-spam law; purchased lists hurt deliverability.)
              </span>
            </Label>
            {!hasEmail && <p className="text-destructive text-sm">Map one column to Email.</p>}
            <Input type="hidden" value={file?.name ?? ''} readOnly />
          </div>
        )}

        <DialogFooter>
          {preview && !importId && (
            <Button
              onClick={() => start.mutate()}
              disabled={!hasEmail || !consent || start.isPending}
            >
              {start.isPending && <Loader2 className="size-4 animate-spin" />} Import contacts
            </Button>
          )}
          {finished && <Button onClick={() => setOpen(false)}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
