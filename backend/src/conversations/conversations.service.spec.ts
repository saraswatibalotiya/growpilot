import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConversationsService } from './conversations.service';

const OWNER_BIZ = 'biz-1';

function build() {
  const conversations = new Map<string, Record<string, unknown>>();
  const messages: Record<string, unknown>[] = [];
  const repository = {
    create: jest.fn(async (id: string, businessId: string, userId: string) => {
      const row = { id, businessId, userId, status: 'active' };
      conversations.set(id, row);
      return row;
    }),
    findById: jest.fn(async (id: string) => conversations.get(id) ?? null),
    listMessages: jest.fn(async (conversationId: string) => messages.filter((m) => m['conversationId'] === conversationId)),
    appendMessage: jest.fn(async (id: string, conversationId: string, data: Record<string, unknown>) => {
      const row = { id, conversationId, createdAt: new Date(), ...data };
      messages.push(row);
      return row;
    }),
  };
  const business = { primaryBusinessId: jest.fn().mockResolvedValue(OWNER_BIZ) };
  const service = new ConversationsService(business as never, repository as never);
  return { service, repository, business, conversations };
}

describe('ConversationsService', () => {
  it('starts a conversation for the owner business', async () => {
    const { service } = build();
    await expect(service.create('user-1')).resolves.toMatchObject({ businessId: OWNER_BIZ, userId: 'user-1', status: 'active' });
  });

  it('stores the owner transcript as a user message', async () => {
    const { service, repository } = build();
    const conv = await service.create('user-1');
    const msg = await service.addUserMessage('user-1', conv.id as string, { content: 'Price 899', language: 'hi' });
    expect(msg).toMatchObject({ role: 'user', content: 'Price 899', language: 'hi' });
    expect(repository.appendMessage).toHaveBeenCalled();
  });

  it('keeps assistant replies out of the user endpoint and stores them internally', async () => {
    const { service } = build();
    const conv = await service.create('user-1');
    const reply = await service.addAssistantMessage(conv.id as string, { content: 'Here is your caption', language: 'en' });
    expect(reply).toMatchObject({ role: 'assistant' });
  });

  it('returns the conversation with its messages oldest first', async () => {
    const { service } = build();
    const conv = await service.create('user-1');
    await service.addUserMessage('user-1', conv.id as string, { content: 'first' });
    await service.addUserMessage('user-1', conv.id as string, { content: 'second' });
    const loaded = await service.get('user-1', conv.id as string);
    expect(loaded.messages.map((m) => m['content'])).toEqual(['first', 'second']);
  });

  it('refuses messages on a closed conversation', async () => {
    const { service, conversations } = build();
    const conv = await service.create('user-1');
    conversations.get(conv.id as string)!['status'] = 'closed';
    await expect(service.addUserMessage('user-1', conv.id as string, { content: 'hello' })).rejects.toBeInstanceOf(ConflictException);
  });

  it("answers 404 for another owner's conversation", async () => {
    const { service, business } = build();
    const conv = await service.create('user-1');
    business.primaryBusinessId.mockResolvedValue('other-biz');
    await expect(service.get('user-2', conv.id as string)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addUserMessage('user-2', conv.id as string, { content: 'x' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
