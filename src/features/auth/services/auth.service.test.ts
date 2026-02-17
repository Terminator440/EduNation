import { describe, it, expect, vi, beforeEach } from 'vitest';
import { signUpUser, signInUser, signOutUser, updateActiveRole, fetchUserRoles, fetchProfile } from './auth.service';
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/hooks/useAuth';

// Mock Supabase client
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

describe('auth.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signUpUser', () => {
    it('should sign up a user successfully', async () => {
      const mockSignUp = vi.mocked(supabase.auth.signUp);
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: '123' }, session: null },
        error: null,
      });

      await signUpUser('test@example.com', 'password123', 'Test User', 'student');

      expect(mockSignUp).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
        options: {
          emailRedirectTo: expect.stringContaining('/'),
          data: { full_name: 'Test User', role: 'student', phone: null },
        },
      });
    });

    it('should throw error when sign up fails', async () => {
      const mockSignUp = vi.mocked(supabase.auth.signUp);
      const error = new Error('Sign up failed');
      mockSignUp.mockResolvedValueOnce({
        data: { user: null, session: null },
        error,
      });

      await expect(
        signUpUser('test@example.com', 'password123', 'Test User', 'student')
      ).rejects.toThrow('Sign up failed');
    });

    it('should include phone number when provided', async () => {
      const mockSignUp = vi.mocked(supabase.auth.signUp);
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: '123' }, session: null },
        error: null,
      });

      await signUpUser('test@example.com', 'password123', 'Test User', 'student', '+40123456789');

      expect(mockSignUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              phone: '+40123456789',
            }),
          }),
        })
      );
    });
  });

  describe('signInUser', () => {
    it('should sign in a user successfully', async () => {
      const mockSignIn = vi.mocked(supabase.auth.signInWithPassword);
      mockSignIn.mockResolvedValueOnce({
        data: { user: { id: '123' }, session: { access_token: 'token' } },
        error: null,
      });

      await signInUser('test@example.com', 'password123');

      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password123',
      });
    });

    it('should throw error when sign in fails', async () => {
      const mockSignIn = vi.mocked(supabase.auth.signInWithPassword);
      const error = new Error('Invalid credentials');
      mockSignIn.mockResolvedValueOnce({
        data: { user: null, session: null },
        error,
      });

      await expect(signInUser('test@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials');
    });
  });

  describe('signOutUser', () => {
    it('should sign out user successfully', async () => {
      const mockSignOut = vi.mocked(supabase.auth.signOut);
      mockSignOut.mockResolvedValueOnce({ error: null });

      await signOutUser();

      expect(mockSignOut).toHaveBeenCalled();
    });
  });

  describe('updateActiveRole', () => {
    it('should update active role successfully', async () => {
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        update: mockUpdate,
      } as never);

      await updateActiveRole('user-id-123', 'teacher');

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(mockUpdate).toHaveBeenCalledWith({ active_role: 'teacher' });
    });
  });

  describe('fetchUserRoles', () => {
    it('should fetch user roles successfully', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { role: 'student' },
            { role: 'teacher' },
          ],
          error: null,
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as never);

      const roles = await fetchUserRoles('user-id-123');

      expect(supabase.from).toHaveBeenCalledWith('user_roles');
      expect(roles).toEqual(['student', 'teacher']);
    });

    it('should return empty array when no data', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as never);

      const roles = await fetchUserRoles('user-id-123');

      expect(roles).toEqual([]);
    });

    it('should filter invalid roles', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { role: 'student' },
            { role: 'invalid_role' },
            { role: 'teacher' },
          ],
          error: null,
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as never);

      const roles = await fetchUserRoles('user-id-123');

      expect(roles).toEqual(['student', 'teacher']);
    });
  });

  describe('fetchProfile', () => {
    it('should fetch profile successfully', async () => {
      const mockProfile = {
        id: 'user-id-123',
        full_name: 'Test User',
        email: 'test@example.com',
        phone: '+40123456789',
        active_role: 'student' as AppRole,
        school_id: null,
      };

      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: mockProfile,
            error: null,
          }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as never);

      const profile = await fetchProfile('user-id-123');

      expect(supabase.from).toHaveBeenCalledWith('profiles');
      expect(profile).toEqual(mockProfile);
    });

    it('should return null when profile not found', async () => {
      const mockSelect = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: null,
            error: null,
          }),
        }),
      });
      vi.mocked(supabase.from).mockReturnValue({
        select: mockSelect,
      } as never);

      const profile = await fetchProfile('non-existent-id');

      expect(profile).toBeNull();
    });
  });
});
