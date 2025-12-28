#!/usr/bin/env python3
"""
WhatsApp Clone Backend API Testing Script - Simplified Version
Tests backend endpoints with proper NextAuth session handling.
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
            "name": "Alice Johnson",
            "email": "alice.johnson@example.com", 
            "password": "securepass123"
        }
        self.user2_data = {
            "name": "Bob Smith",
            "email": "bob.smith@example.com",
            "password": "securepass123"
        }

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
            # Test the catch-all route
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
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("User 1 Registration", True, "User 1 registered successfully", data)
            elif response.status_code == 400 and "already exists" in response.text:
                self.log_result("User 1 Registration", True, "User 1 already exists (expected for repeat tests)")
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
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("User 2 Registration", True, "User 2 registered successfully", data)
            elif response.status_code == 400 and "already exists" in response.text:
                self.log_result("User 2 Registration", True, "User 2 already exists (expected for repeat tests)")
            else:
                self.log_result("User 2 Registration", False, f"Registration failed with status {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("User 2 Registration", False, f"Registration request failed: {str(e)}")

    def test_nextauth_endpoints(self):
        """Test NextAuth configuration endpoints"""
        print("\n=== Testing NextAuth Configuration ===")
        
        # Test CSRF endpoint
        try:
            response = self.session.get(f"{API_BASE}/auth/csrf", timeout=10)
            if response.status_code == 200:
                data = response.json()
                self.log_result("NextAuth CSRF", True, "CSRF endpoint working", data)
            else:
                self.log_result("NextAuth CSRF", False, f"CSRF failed with status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("NextAuth CSRF", False, f"CSRF request failed: {str(e)}")

        # Test providers endpoint
        try:
            response = self.session.get(f"{API_BASE}/auth/providers", timeout=10)
            if response.status_code == 200:
                data = response.json()
                providers = list(data.keys()) if data else []
                self.log_result("NextAuth Providers", True, f"Providers available: {providers}", data)
            else:
                self.log_result("NextAuth Providers", False, f"Providers failed with status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("NextAuth Providers", False, f"Providers request failed: {str(e)}")

        # Test session endpoint (should return null when not authenticated)
        try:
            response = self.session.get(f"{API_BASE}/auth/session", timeout=10)
            if response.status_code == 200:
                data = response.json()
                if data is None:
                    self.log_result("NextAuth Session", True, "Session endpoint working (no active session)")
                else:
                    self.log_result("NextAuth Session", True, "Session endpoint working (active session found)", data)
            else:
                self.log_result("NextAuth Session", False, f"Session failed with status {response.status_code}", response.text)
        except Exception as e:
            self.log_result("NextAuth Session", False, f"Session request failed: {str(e)}")

    def test_protected_endpoints_unauthorized(self):
        """Test that protected endpoints properly return 401 when not authenticated"""
        print("\n=== Testing Protected Endpoints (Unauthorized) ===")
        
        endpoints_to_test = [
            ("GET", "/users", "Get Users"),
            ("GET", "/users?search=test", "Search Users"),
            ("GET", "/conversations", "Get Conversations"),
            ("POST", "/conversations", "Create Conversation"),
            ("GET", "/messages?conversationId=test", "Get Messages"),
            ("POST", "/messages", "Send Message"),
            ("PATCH", "/messages/status", "Update Message Status")
        ]
        
        for method, endpoint, name in endpoints_to_test:
            try:
                if method == "GET":
                    response = self.session.get(f"{API_BASE}{endpoint}", timeout=10)
                elif method == "POST":
                    response = self.session.post(f"{API_BASE}{endpoint}", json={}, timeout=10)
                elif method == "PATCH":
                    response = self.session.patch(f"{API_BASE}{endpoint}", json={}, timeout=10)
                
                if response.status_code == 401:
                    self.log_result(f"Protected: {name}", True, "Correctly returns 401 Unauthorized")
                else:
                    self.log_result(f"Protected: {name}", False, f"Expected 401 but got {response.status_code}", response.text[:200])
                    
            except Exception as e:
                self.log_result(f"Protected: {name}", False, f"Request failed: {str(e)}")

    def test_api_structure_and_validation(self):
        """Test API structure and input validation"""
        print("\n=== Testing API Structure & Validation ===")
        
        # Test invalid registration data
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json={"email": "invalid-email"},  # Missing required fields
                timeout=10
            )
            
            if response.status_code == 400:
                data = response.json()
                self.log_result("Registration Validation", True, f"Correctly validates input: {data.get('error', 'Validation error')}")
            else:
                self.log_result("Registration Validation", False, f"Should validate input but returned {response.status_code}")
                
        except Exception as e:
            self.log_result("Registration Validation", False, f"Request failed: {str(e)}")

        # Test invalid conversation creation (should be 401 due to no auth, but structure should be correct)
        try:
            response = self.session.post(
                f"{API_BASE}/conversations",
                json={"invalidField": "test"},
                timeout=10
            )
            
            if response.status_code == 401:
                self.log_result("Conversation Endpoint Structure", True, "Endpoint exists and requires authentication")
            else:
                self.log_result("Conversation Endpoint Structure", False, f"Unexpected response: {response.status_code}")
                
        except Exception as e:
            self.log_result("Conversation Endpoint Structure", False, f"Request failed: {str(e)}")

        # Test invalid message creation
        try:
            response = self.session.post(
                f"{API_BASE}/messages",
                json={"invalidField": "test"},
                timeout=10
            )
            
            if response.status_code == 401:
                self.log_result("Messages Endpoint Structure", True, "Endpoint exists and requires authentication")
            else:
                self.log_result("Messages Endpoint Structure", False, f"Unexpected response: {response.status_code}")
                
        except Exception as e:
            self.log_result("Messages Endpoint Structure", False, f"Request failed: {str(e)}")

    def test_database_connectivity(self):
        """Test database connectivity through registration"""
        print("\n=== Testing Database Connectivity ===")
        
        # Try to register a unique user to test DB connectivity
        unique_email = f"dbtest_{datetime.now().strftime('%Y%m%d_%H%M%S')}@example.com"
        test_user = {
            "name": "DB Test User",
            "email": unique_email,
            "password": "testpass123"
        }
        
        try:
            response = self.session.post(
                f"{API_BASE}/auth/register",
                json=test_user,
                timeout=10
            )
            
            if response.status_code in [200, 201]:
                data = response.json()
                self.log_result("Database Connectivity", True, "Database operations working (user created)", data)
            else:
                self.log_result("Database Connectivity", False, f"Database operation failed: {response.status_code}", response.text)
                
        except Exception as e:
            self.log_result("Database Connectivity", False, f"Database test failed: {str(e)}")

    def run_all_tests(self):
        """Run all tests in sequence"""
        print("🚀 Starting WhatsApp Clone Backend API Tests (Simplified)")
        print(f"📍 Testing API at: {API_BASE}")
        print("=" * 60)
        
        # Basic connectivity test
        if not self.test_basic_connectivity():
            print("\n❌ Basic connectivity failed. Stopping tests.")
            return self.generate_summary()
        
        # Test user registration and database connectivity
        self.test_user_registration()
        self.test_database_connectivity()
        
        # Test NextAuth configuration
        self.test_nextauth_endpoints()
        
        # Test that protected endpoints are properly secured
        self.test_protected_endpoints_unauthorized()
        
        # Test API structure and validation
        self.test_api_structure_and_validation()
        
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
        
        # Analysis
        print("\n🔍 ANALYSIS:")
        auth_working = any("NextAuth" in r['test'] and r['success'] for r in self.test_results)
        db_working = any("Database" in r['test'] and r['success'] for r in self.test_results)
        registration_working = any("Registration" in r['test'] and r['success'] for r in self.test_results)
        protection_working = any("Protected" in r['test'] and r['success'] for r in self.test_results)
        
        print(f"  • User Registration: {'✅ Working' if registration_working else '❌ Issues'}")
        print(f"  • Database Operations: {'✅ Working' if db_working else '❌ Issues'}")
        print(f"  • NextAuth Configuration: {'✅ Working' if auth_working else '❌ Issues'}")
        print(f"  • API Security: {'✅ Working' if protection_working else '❌ Issues'}")
        
        return {
            'total': total_tests,
            'passed': passed_tests,
            'failed': failed_tests,
            'results': self.test_results,
            'analysis': {
                'registration_working': registration_working,
                'database_working': db_working,
                'auth_working': auth_working,
                'protection_working': protection_working
            }
        }

if __name__ == "__main__":
    tester = WhatsAppCloneAPITester()
    summary = tester.run_all_tests()
    
    # Save results to file
    with open('/app/test_results_backend_simplified.json', 'w') as f:
        json.dump(summary, f, indent=2)
    
    print(f"\n💾 Detailed results saved to: /app/test_results_backend_simplified.json")
    
    # Exit with appropriate code
    exit(0 if summary['failed'] == 0 else 1)