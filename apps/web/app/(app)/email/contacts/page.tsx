'use client';

import { contactSchema, type ContactInput } from '@automarket/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { ListPlus, Plus, Search, Trash2, Users } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api/client';
import { contactLists, contacts } from '@/lib/api/resources';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ImportDialog } from './import-dialog';

function AddContactDialog({ listId }: { listId?: string }) {
  const [open, setOpen] = useState(false);
  const create = contacts.useCreate();
  const form = useForm<ContactInput>({
    resolver: zodResolver(contactSchema) as never,
    defaultValues: {
      email: '',
      firstName: '',
      lastName: '',
      tags: [],
      attributes: {},
      listIds: [],
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="size-4" /> Add contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a contact</DialogTitle>
        </DialogHeader>
        <form
          id="add-contact"
          onSubmit={form.handleSubmit((v) =>
            create.mutate(
              { ...v, listIds: listId ? [listId] : [] },
              { onSuccess: () => (toast.success('Contact added'), form.reset(), setOpen(false)) },
            ),
          )}
        >
          <FieldGroup>
            <FormField control={form.control} name="email" label="Email">
              {(f) => <Input {...f} value={f.value as string} type="email" />}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField control={form.control} name="firstName" label="First name">
                {(f) => <Input {...f} value={(f.value as string) ?? ''} />}
              </FormField>
              <FormField control={form.control} name="lastName" label="Last name">
                {(f) => <Input {...f} value={(f.value as string) ?? ''} />}
              </FormField>
            </div>
          </FieldGroup>
        </form>
        <DialogFooter>
          <Button type="submit" form="add-contact" disabled={create.isPending}>
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function ContactsPage() {
  const [listId, setListId] = useState<string | undefined>();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [newList, setNewList] = useState('');
  const qc = useQueryClient();
  const { data: lists } = contactLists.useList({ pageSize: 100 });
  const { data, isLoading } = contacts.useList({ listId, search, pageSize: 100 });
  const createList = contactLists.useCreate();
  const bulkDelete = useMutation({
    mutationFn: (ids: string[]) => api('/contacts/bulk-delete', { method: 'POST', body: { ids } }),
    onSuccess: () => (
      setSelected([]),
      qc.invalidateQueries({ queryKey: ['contacts'] }),
      toast.success('Deleted')
    ),
  });
  const addToList = useMutation({
    mutationFn: ({ list, ids }: { list: string; ids: string[] }) =>
      api(`/contact-lists/${list}/members`, { method: 'POST', body: { ids } }),
    onSuccess: () => (
      setSelected([]),
      qc.invalidateQueries({ queryKey: ['contact-lists'] }),
      qc.invalidateQueries({ queryKey: ['contacts'] }),
      toast.success('Added to list')
    ),
  });
  const items = data?.items ?? [];
  const allOn = items.length > 0 && selected.length === items.length;

  return (
    <>
      <PageHeader
        title="Contacts"
        description="Your audience for email campaigns. Import from anywhere, organise into lists."
        actions={
          <>
            <AddContactDialog listId={listId} />
            <ImportDialog lists={lists?.items ?? []} />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="text-base">Lists</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <button
              type="button"
              onClick={() => setListId(undefined)}
              className={cn(
                'hover:bg-muted flex w-full justify-between rounded-md px-2 py-1.5 text-sm',
                !listId && 'bg-muted font-medium',
              )}
            >
              All contacts{' '}
              <span className="text-muted-foreground tabular-nums">
                {!listId ? (data?.total ?? '') : ''}
              </span>
            </button>
            {lists?.items.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => setListId(l.id)}
                className={cn(
                  'hover:bg-muted flex w-full justify-between rounded-md px-2 py-1.5 text-sm',
                  listId === l.id && 'bg-muted font-medium',
                )}
              >
                <span className="truncate">{l.name}</span>
                <span className="text-muted-foreground tabular-nums">{l.memberCount}</span>
              </button>
            ))}
            <form
              className="flex gap-1 pt-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (newList.trim())
                  createList.mutate({ name: newList.trim() }, { onSuccess: () => setNewList('') });
              }}
            >
              <Input
                value={newList}
                onChange={(e) => setNewList(e.target.value)}
                placeholder="New list"
                className="h-8"
              />
              <Button size="icon-sm" type="submit" aria-label="Create list">
                <Plus className="size-4" />
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative max-w-sm flex-1">
              <Search className="text-muted-foreground absolute top-2 left-2.5 size-4" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email"
                className="pl-8"
              />
            </div>
            {selected.length > 0 && (
              <>
                <span className="text-muted-foreground text-sm">{selected.length} selected</span>
                {lists?.items.slice(0, 3).map((l) => (
                  <Button
                    key={l.id}
                    size="sm"
                    variant="outline"
                    onClick={() => addToList.mutate({ list: l.id, ids: selected })}
                  >
                    <ListPlus className="size-4" /> {l.name}
                  </Button>
                ))}
                <Button size="sm" variant="destructive" onClick={() => bulkDelete.mutate(selected)}>
                  <Trash2 className="size-4" /> Delete
                </Button>
              </>
            )}
          </div>
          {isLoading && <Skeleton className="h-64 w-full" />}
          {!isLoading && items.length === 0 && (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Import a CSV or add contacts one by one."
            />
          )}
          {items.length > 0 && (
            <Card className="py-0">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allOn}
                          onCheckedChange={(v) => setSelected(v ? items.map((c) => c.id) : [])}
                          aria-label="Select all"
                        />
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Lists & tags</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Checkbox
                            checked={selected.includes(c.id)}
                            onCheckedChange={(v) =>
                              setSelected((s) => (v ? [...s, c.id] : s.filter((x) => x !== c.id)))
                            }
                            aria-label={`Select ${c.email}`}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{c.email}</TableCell>
                        <TableCell>
                          {[c.firstName, c.lastName].filter(Boolean).join(' ') || '—'}
                        </TableCell>
                        <TableCell className="space-x-1">
                          {c.lists.map((l) => (
                            <Badge key={l.id} variant="secondary">
                              {l.name}
                            </Badge>
                          ))}
                          {c.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="outline">
                              {t}
                            </Badge>
                          ))}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
          {data && data.total > items.length && (
            <p className="text-muted-foreground text-xs">
              Showing {items.length} of {data.total.toLocaleString()} — refine with search or lists.
            </p>
          )}
        </div>
      </div>
    </>
  );
}
