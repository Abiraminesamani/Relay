import unittest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.db.models import User, Repository
from app.services.architecture_service import (
    get_dependency_graph_service,
    get_impact_analysis_service,
    get_database_schema_service,
)


class TestArchitectureVisualizer(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(bind=self.engine)
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)
        self.db = self.SessionLocal()

        self.user = User(name="Dev Tester", email="architect@relay.ai", password_hash="hash")
        self.db.add(self.user)
        self.db.commit()
        self.db.refresh(self.user)

        self.repo = Repository(name="Relay-Core", repo_url="https://github.com/relay/relay-core", user_id=self.user.id)
        self.db.add(self.repo)
        self.db.commit()
        self.db.refresh(self.repo)

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(bind=self.engine)

    def test_dependency_graph_generation(self):
        graph = get_dependency_graph_service(self.db, self.user, self.repo.id)
        self.assertEqual(graph.repository_id, self.repo.id)
        self.assertGreater(graph.total_modules, 10)
        self.assertGreater(graph.total_dependencies, 10)
        self.assertIn("route", graph.categories)
        self.assertIn("service", graph.categories)
        self.assertIn("agent", graph.categories)

        # Ensure nodes have degrees computed
        auth_service_node = next((n for n in graph.nodes if n.id == "services/auth_service.py"), None)
        self.assertIsNotNone(auth_service_node)
        self.assertGreaterEqual(auth_service_node.in_degree, 1)

    def test_impact_analysis_critical_file(self):
        impact = get_impact_analysis_service(self.db, self.user, self.repo.id, "backend/app/db/models.py")
        self.assertEqual(impact.risk_level, "CRITICAL")
        self.assertGreaterEqual(impact.risk_score, 90)
        self.assertIn("services/auth_service.py", impact.direct_dependents)
        self.assertGreater(len(impact.impacted_endpoints), 0)
        self.assertIn("Modifying", impact.ai_recommendation)

    def test_impact_analysis_service_file(self):
        impact = get_impact_analysis_service(self.db, self.user, self.repo.id, "backend/app/services/code_service.py")
        self.assertIn("api/routes/code.py", impact.direct_dependents)
        self.assertTrue(any(ep.path == "/code/inline-assist" for ep in impact.impacted_endpoints))

    def test_database_schema_extraction(self):
        schema = get_database_schema_service()
        self.assertGreater(schema.total_tables, 3)
        self.assertGreater(schema.total_relationships, 2)

        table_names = [t.name for t in schema.tables]
        self.assertIn("users", table_names)
        self.assertIn("repositories", table_names)
        self.assertIn("webhook_subscriptions", table_names)

        # Check repository foreign key relationship to users
        repo_table = next((t for t in schema.tables if t.name == "repositories"), None)
        self.assertIsNotNone(repo_table)
        self.assertIn("user_id", repo_table.foreign_keys)


if __name__ == "__main__":
    unittest.main()
