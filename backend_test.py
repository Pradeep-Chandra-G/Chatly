#!/usr/bin/env python3
"""
WhatsApp Clone Backend API Testing Script
Tests all backend endpoints for the WhatsApp clone application.
"""

import requests
import json
import os
from datetime import datetime

# Get base URL from environment
BASE_URL = os.getenv('NEXT_PUBLIC_BASE_URL', 'https://securesync-5.preview.emergentagent.com')
API_BASE = f"{BASE_URL}/api"

class WhatsAppCloneAPITester:
    def __init__(self):
        self.session = requests.Session()
        self.test_results = []
        self.user1_data = {
            "name": "Test User 1",
            "email": "test1@example.com", 
            "password": "password123"
        }
        self.user2_data = {
            "name": "Test User 2",
            "email": "test2@example.com",
            "password": "password123"
        }
        self.auth_token = None
        self.user1_id = None
        self.user2_id = None
        self.conversation_id = None
        self.message_id = None

    def log_result(self, test_name, success, message, response_data=None):
        """Log test result"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "timestamp": datetime.now().isoformat(),
            "response_data": response_data
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {message}")
        if response_data and not success:
            print(f"   Response: {response_data}")

    def test_basic_connectivity(self):
        """Test basic API connectivity"""
        try:
            response = self.session.get(f"{API_BASE}/root", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("Basic Connectivity", True, f"API is accessible - {data.get('message', 'OK')}")
                return True
            else:
                self.log_result("Basic Connectivity", False, f"API returned status {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("Basic Connectivity", False, f"Connection failed: {str(e)}")
            return False

    def test_user_registration(self):
        """Test user registration endpoint"""
        print("\n=== Testing User Registration ===")
        
        # Test User 1 Registration
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json=self.user1_data,
                timeout=10
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.user1_id = data.get('user', {}).get('id') or data.get('id')
                self.log_result("User 1 Registration", True, "User 1 registered successfully", data)
            else:
                self.log_result("User 1 Registration", False, f"Registration failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("User 1 Registration", False, f"Registration request failed: {str(e)}")

        # Test User 2 Registration
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json=self.user2_data,
                timeout=10
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.user2_id = data.get('user', {}).get('id') or data.get('id')
                self.log_result("User 2 Registration", True, "User 2 registered successfully", data)
            else:
                self.log_result("User 2 Registration", False, f"Registration failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("User 2 Registration", False, f"Registration request failed: {str(e)}")

    def test_user_authentication(self):
        """Test user authentication/login"""
        print("\n=== Testing User Authentication ===")
        
        # Test NextAuth CSRF token first
        try:
            # Get CSRF token
            csrf_response = self.session.get(f"{API_BASE}/auth/csrf", timeout=10)
            if csrf_response.status_code == 200:
                csrf_data = csrf_response.json()
                csrf_token = csrf_data.get('csrfToken')
                self.log_result("Get CSRF Token", True, "CSRF token retrieved successfully")
                
                # Try NextAuth credentials signin
                signin_data = {
                    "email": self.user1_data["email"],
                    "password": self.user1_data["password"],
                    "csrfToken": csrf_token,
                    "callbackUrl": BASE_URL,
                    "json": "true"
                }
                
                response = self.session.post(
                    f"{API_BASE}/auth/callback/credentials",
                    data=signin_data,
                    timeout=10,
                    allow_redirects=False
                )
                
                if response.status_code in [200, 302]:
                    self.log_result("User Authentication", True, f"Login successful with status {response.status_code}")
                    # Check if we have session cookies
                    if 'next-auth.session-token' in self.session.cookies or 'next-auth.csrf-token' in self.session.cookies:
                        self.log_result("Session Cookies", True, "Authentication cookies set successfully")
                    else:
                        self.log_result("Session Cookies", False, "No authentication cookies found")
                else:
                    self.log_result("User Authentication", False, f"Login failed with status {response.status_code}", response.text[:500])
            else:
                self.log_result("Get CSRF Token", False, f"Failed to get CSRF token: {csrf_response.status_code}")
                # Try direct session check
                session_response = self.session.get(f"{API_BASE}/auth/session", timeout=10)
                if session_response.status_code == 200:
                    session_data = session_response.json()
                    if session_data:
                        self.log_result("User Authentication", True, "Already authenticated via session", session_data)
                    else:
                        self.log_result("User Authentication", False, "No active session found")
                else:
                    self.log_result("User Authentication", False, f"Session check failed: {session_response.status_code}")
                
        except Exception as e:
            self.log_result("User Authentication", False, f"Authentication request failed: {str(e)}")

    def test_get_users(self):
        """Test getting all users"""
        print("\n=== Testing User Management ===")
        
        try:
            response = self.session.get(f"{API_BASE}/users", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                users = data.get('users', [])
                self.log_result("Get All Users", True, f"Retrieved {len(users)} users", data)
            else:
                self.log_result("Get All Users", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Get All Users", False, f"Request failed: {str(e)}")

    def test_search_users(self):
        """Test user search functionality"""
        try:
            response = self.session.get(f"{API_BASE}/users?search=Test", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                users = data.get('users', [])
                self.log_result("Search Users", True, f"Search returned {len(users)} users", data)
            else:
                self.log_result("Search Users", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Search Users", False, f"Request failed: {str(e)}")

    def test_create_conversation(self):
        """Test creating a conversation"""
        print("\n=== Testing Conversations ===")
        
        if not self.user2_id:
            self.log_result("Create Conversation", False, "Cannot test - User 2 ID not available")
            return
            
        try:
            response = self.session.post(
                f"{API_BASE}/conversations",
                json={"participantId": self.user2_id},
                timeout=10
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.conversation_id = data.get('conversation', {}).get('_id') or data.get('_id')
                self.log_result("Create Conversation", True, "Conversation created successfully", data)
            else:
                self.log_result("Create Conversation", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Create Conversation", False, f"Request failed: {str(e)}")

    def test_get_conversations(self):
        """Test getting user conversations"""
        try:
            response = self.session.get(f"{API_BASE}/conversations", timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                conversations = data.get('conversations', [])
                self.log_result("Get Conversations", True, f"Retrieved {len(conversations)} conversations", data)
            else:
                self.log_result("Get Conversations", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Get Conversations", False, f"Request failed: {str(e)}")

    def test_send_message(self):
        """Test sending a message"""
        print("\n=== Testing Messaging ===")
        
        if not self.conversation_id:
            self.log_result("Send Message", False, "Cannot test - Conversation ID not available")
            return
            
        try:
            message_data = {
                "conversationId": self.conversation_id,
                "content": "Hello! This is a test message from the automated test suite."
            }
            
            response = self.session.post(
                f"{API_BASE}/messages",
                json=message_data,
                timeout=10
            )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.message_id = data.get('message', {}).get('_id') or data.get('_id')
                self.log_result("Send Message", True, "Message sent successfully", data)
            else:
                self.log_result("Send Message", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Send Message", False, f"Request failed: {str(e)}")

    def test_get_messages(self):
        """Test getting messages for a conversation"""
        if not self.conversation_id:
            self.log_result("Get Messages", False, "Cannot test - Conversation ID not available")
            return
            
        try:
            response = self.session.get(
                f"{API_BASE}/messages?conversationId={self.conversation_id}",
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                messages = data.get('messages', [])
                self.log_result("Get Messages", True, f"Retrieved {len(messages)} messages", data)
            else:
                self.log_result("Get Messages", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Get Messages", False, f"Request failed: {str(e)}")

    def test_update_message_status(self):
        """Test updating message status"""
        if not self.message_id:
            self.log_result("Update Message Status", False, "Cannot test - Message ID not available")
            return
            
        # Test delivered status
        try:
            response = self.session.patch(
                f"{API_BASE}/messages/status",
                json={
                    "messageId": self.message_id,
                    "status": "delivered"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Update Message Status (Delivered)", True, "Status updated to delivered", data)
            else:
                self.log_result("Update Message Status (Delivered)", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Update Message Status (Delivered)", False, f"Request failed: {str(e)}")

        # Test read status
        try:
            response = self.session.patch(
                f"{API_BASE}/messages/status",
                json={
                    "messageId": self.message_id,
                    "status": "read"
                },
                timeout=10
            )
            
            if response.status_code == 200:
                data = response.json()
                self.log_result("Update Message Status (Read)", True, "Status updated to read", data)
            else:
                self.log_result("Update Message Status (Read)", False, f"Failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Update Message Status (Read)", False, f"Request failed: {str(e)}")

    def test_error_cases(self):
        """Test error handling"""
        print("\n=== Testing Error Cases ===")
        
        # Test invalid registration data
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json={"email": "invalid-email"},  # Missing required fields
                timeout=10
            )
            
            if response.status_code >= 400:
                self.log_result("Invalid Registration Data", True, f"Correctly rejected invalid data with status {response.status_code}")
            else:
                self.log_result("Invalid Registration Data", False, f"Should have rejected invalid data but returned {response.status_code}")
                
        except Exception as e:
            self.log_result("Invalid Registration Data", False, f"Request failed: {str(e)}")

        # Test invalid conversation creation
        try:
            response = self.session.post(
                f"{API_BASE}/conversations",
                json={"participantId": "invalid-id"},
                timeout=10
            )
            
            if response.status_code >= 400:
                self.log_result("Invalid Conversation Creation", True, f"Correctly rejected invalid participant ID with status {response.status_code}")
            else:
                self.log_result("Invalid Conversation Creation", False, f"Should have rejected invalid participant ID but returned {response.status_code}")
                
        except Exception as e:
            self.log_result("Invalid Conversation Creation", False, f"Request failed: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting WhatsApp Clone Backend API Tests")
        print(f"📍 Testing API at: {API_BASE}")
        print("=" * 60)
        
        # Basic connectivity test
        if not self.test_basic_connectivity():
            print("\n❌ Basic connectivity failed. Stopping tests.")
            return self.generate_summary()
        
        # Authentication and user management tests
        self.test_user_registration()
        self.test_user_authentication()
        self.test_get_users()
        self.test_search_users()
        
        # Conversation tests
        self.test_create_conversation()
        self.test_get_conversations()
        
        # Messaging tests
        self.test_send_message()
        self.test_get_messages()
        self.test_update_message_status()
        
        # Error handling tests
        self.test_error_cases()
        
        return self.generate_summary()

    def generate_summary(self):
        """Generate test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        total_tests = len(self.test_results)
        passed_tests = len([r for r in self.test_results if r['success']])
        failed_tests = total_tests - passed_tests
        
        print(f"Total Tests: {total_tests}")
        print(f"Passed: {passed_tests}")
        print(f"Failed: {failed_tests}")
        print(f"Success Rate: {(passed_tests/total_tests*100):.1f}%" if total_tests > 0 else "No tests run")
        
        if failed_tests > 0:
            print("\n❌ FAILED TESTS:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  • {result['test']}: {result['message']}")
        
        print("\n📋 DETAILED RESULTS:")
        for result in self.test_results:
            status = "✅" if result['success'] else "❌"
            print(f"  {status} {result['test']}")
        
        return {
            'total': total_tests,
            'passed': passed_tests,
            'failed': failed_tests,
            'results': self.test_results
        }

if __name__ == "__main__":
    tester = WhatsAppCloneAPITester()
    summary = tester.run_all_tests()
    
    # Save results to file
    with open('/app/test_results_backend.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n💾 Detailed results saved to: /app/test_results_backend.json")
    
    # Exit with appropriate code
    exit(0 if summary['failed'] == 0 else 1)